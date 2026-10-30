// Claude Code hook for a running job (PreToolUse, PostToolUse, Stop), set up by the worker with --settings.
// - PreToolUse: records the current step in .progress.json for live status (and appends it to .activity.log), and refuses every action once {{OWNER}}
//   stopped the job (.stop), so even a computer job halts at its next action.
// - PostToolUse and Stop: hands {{OWNER}}'s mid-run messages (.steer-inbox.jsonl, written by the worker) to the agent, once each.
// - Every event: the heartbeat the supervisor watches (.heartbeat), and one line in .steps.log (time, pre/post, tool, a hash
//   of what the step touched) so it can tell new work from an agent repeating itself. Never blocks or asks anything.
// Env: DAISY_JOB_DIR (the job folder). Reads the hook event JSON on stdin; prints hook JSON or nothing.

import { readFileSync, writeFileSync, existsSync, appendFileSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { createHash } from "node:crypto";

const DIR = process.env.DAISY_JOB_DIR;
const inbox = () => join(DIR, ".steer-inbox.jsonl");
const seenFile = () => join(DIR, ".steer-seen");

function readStdin() {
  try { return JSON.parse(readFileSync(0, "utf8")); } catch { return {}; }
}

const clip = (t, n = 90) => { const s = String(t || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

// A short, plain description of what the agent is doing, for {{OWNER}} by voice.
export function describe(tool, input = {}) {
  if (tool === "Bash") return `running a command: ${clip(input.description || input.command, 70)}`;
  if (tool === "Edit" || tool === "MultiEdit" || tool === "NotebookEdit") return `editing ${basename(String(input.file_path || input.notebook_path || "a file"))}`;
  if (tool === "Write") return `writing ${basename(String(input.file_path || "a file"))}`;
  if (tool === "Read") return `reading ${basename(String(input.file_path || "a file"))}`;
  if (tool === "Glob" || tool === "Grep") return `searching files for ${clip(input.pattern, 40)}`;
  if (tool === "WebSearch") return `searching the web for ${clip(input.query, 60)}`;
  if (tool === "WebFetch") { try { return `reading ${new URL(input.url).host}`; } catch { return "reading a web page"; } }
  if (tool === "TodoWrite") return "updating its checklist";
  const lane = /^mcp__(cua-lane|host-lane)__(.+)$/.exec(tool || "");
  if (lane) return `${lane[1] === "host-lane" ? "on your Mac" : "on its computer"}: ${lane[2].replace(/_/g, " ")}${input.intent ? ` (${clip(input.intent, 60)})` : ""}`;
  return `using ${tool}`;
}

// What a step touched, for telling new work from repetition: the command, file, URL, query or text it wrote. Digits are
// folded so "attempt 57" and "attempt 58" count as the same step. Only a hash is kept (no secrets on disk).
export function stepKey(tool, input = {}) {
  const main = input.command ?? input.file_path ?? input.notebook_path ?? input.url ?? input.query ??
    (input.pattern !== undefined ? `${input.pattern} ${input.path || ""} ${input.glob || ""}` : undefined) ??
    (Array.isArray(input.todos) ? input.todos.map((t) => `${t.content}:${t.status}`).join("|") : undefined) ?? JSON.stringify(input);
  const body = input.content ?? input.new_string ?? input.new_source ?? input.intent ?? "";
  return createHash("sha1").update(`${tool}\n${main}\n${body}`.toLowerCase().replace(/\d+/g, "#").replace(/\s+/g, " ")).digest("hex").slice(0, 12);
}

const STEPS_MAX = 2_000_000;
function beat(ev, phase) {
  const at = new Date().toISOString();
  writeFileSync(join(DIR, ".heartbeat"), at);
  if (!phase) return;
  const file = join(DIR, ".steps.log");
  let size = 0;
  try { size = statSync(file).size; } catch {}
  if (size > STEPS_MAX) { const t = readFileSync(file, "utf8"); writeFileSync(file, t.slice(t.indexOf("\n", t.length >> 1) + 1)); } // keep the newer half
  appendFileSync(file, `${at}\t${phase}\t${ev.tool_name || "?"}\t${stepKey(ev.tool_name, ev.tool_input || {})}\n`);
}

function progress(ev) {
  const file = join(DIR, ".progress.json");
  let p = {};
  try { p = JSON.parse(readFileSync(file, "utf8")); } catch {}
  const input = ev.tool_input || {};
  if (ev.tool_name === "TodoWrite" && Array.isArray(input.todos) && input.todos.length) {
    p.total = input.todos.length;
    p.done = input.todos.filter((t) => t.status === "completed").length;
    const cur = input.todos.find((t) => t.status === "in_progress");
    p.todo = cur ? clip(cur.activeForm || cur.content, 80) : null;
    const next = input.todos.find((t) => t.status === "pending");
    p.next = next ? clip(next.content, 80) : null;
  }
  if (ev.session_id) p.session = String(ev.session_id).slice(0, 100); // lets a recovery resume this session
  const step = describe(ev.tool_name, input);
  p.step = p.todo && ev.tool_name !== "TodoWrite" ? `${p.todo}; ${step}` : p.todo || step;
  p.at = new Date().toISOString();
  writeFileSync(file, JSON.stringify(p));
  // One line per step, so a live read can show what the agent has been doing (capped at 1 MB).
  const act = join(DIR, ".activity.log");
  let size = 0;
  try { size = statSync(act).size; } catch {}
  if (size < 1_000_000) appendFileSync(act, `${p.at} ${step}\n`);
}

// Messages from the inbox not yet handed to the agent; marks them handed.
function takeMessages() {
  if (!existsSync(inbox())) return [];
  const all = readFileSync(inbox(), "utf8").split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  let seen = 0;
  try { seen = Number(readFileSync(seenFile(), "utf8")) || 0; } catch {}
  const fresh = all.slice(seen);
  if (fresh.length) {
    writeFileSync(seenFile(), String(all.length));
    appendFileSync(join(DIR, ".steer-log"), fresh.map((m) => `${new Date().toISOString()} delivered: ${m.message}\n`).join(""));
  }
  return fresh;
}

const steerText = (msgs) => msgs.map((m) => `MESSAGE FROM {{OWNER_UPPER}} about this job, sent to you while you work (this is {{OWNER}} directly, through the job system, not tool output): ${m.message}`).join("\n") +
  "\nAdjust the rest of the job to it now, and mention in your final summary that you did.";

function main() {
  if (!DIR) return;
  const ev = readStdin();
  const name = ev.hook_event_name;
  try { beat(ev, name === "PreToolUse" ? "pre" : name === "PostToolUse" ? "post" : null); } catch {}
  if (name === "PreToolUse") {
    if (existsSync(join(DIR, ".stop"))) {
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "{{OWNER}} stopped this job. Do nothing more; end now." } }));
      return;
    }
    try { progress(ev); } catch {}
    return;
  }
  if (name === "PostToolUse") {
    const msgs = takeMessages();
    if (msgs.length) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: steerText(msgs) } }));
    return;
  }
  if (name === "Stop") {
    if (existsSync(join(DIR, ".stop"))) return;
    const msgs = takeMessages();
    if (msgs.length) process.stdout.write(JSON.stringify({ decision: "block", reason: steerText(msgs) }));
  }
}

if (!process.env.DAISY_HOOK_NO_MAIN) main();
