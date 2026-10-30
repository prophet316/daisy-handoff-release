// Keeps the {{ASSISTANT}} bell session alive: an interactive Claude Code session with Remote Control on and the
// daisy-bell channel loaded, so job events become pushes in the Claude app on {{OWNER}}'s phone.
// Claude Code needs a terminal for this, so it runs inside a pseudo-terminal (worker/pty-run.py), under launchd.
// It answers the known startup prompts for this one session: the project MCP server
// and the development-channel warning (daisy-bell is our own local channel; it isn't on Anthropic's channel allowlist).
// It reads the session's screen only while it starts (worker/bell-prompts.mjs): until Remote Control is up, or 90 seconds.
//
// Usage: node worker/jarvis-bell.mjs   (launchd: com.daisy.jarvis-bell)

import { spawn } from "node:child_process";
import { openSync, readSync, closeSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { hardKill } from "./kill.mjs";
import { promptsToAnswer, ANSWER_WINDOW_MS } from "./bell-prompts.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const HOME_DIR = join(ROOT, "jarvis-bell");
const SCREEN = join(ROOT, "logs", "bell-screen.log");
const CLAUDE = process.env.CLAUDE_BIN || "{{HOME}}/.local/bin/claude";
const NAME = process.env.DAISY_BELL_NAME || "{{ASSISTANT}} bell";

// Log lines quote job titles and messages; control characters are dropped so reading the log in Terminal is safe.
const log = (...a) => console.log(new Date().toISOString(), ...a.map((x) => typeof x === "string" ? x.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "?") : x));
const ANSI = /\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b\][^\x07]*\x07|\x1b[()][A-Z0-9]/g;

// Every process of the bell session carries this tag, so a session left behind by a killed supervisor (still holding the
// bell port) is ended before a new one starts.
const TAG = ["DAISY_BELL_SESSION", "1"];
const PORT = Number(process.env.DAISY_BELL_PORT || 8790);
const left = await hardKill({ tag: TAG }, { graceMs: 3000 });
if (left.found) log(`ended ${left.found} process(es) of an earlier bell session`);

mkdirSync(dirname(SCREEN), { recursive: true });
writeFileSync(SCREEN, "");

const PTY_RUN = join(ROOT, "worker", "pty-run.py");
// Load daisy-bell explicitly and nothing else: the project .mcp.json alone was never started, and this session reads
// event text, so it must not see {{OWNER}}'s other connectors (mail, payments, socials).
const MCP_CONFIG = join(HOME_DIR, ".mcp.json");
const args = [PTY_RUN, SCREEN, CLAUDE, "--remote-control", NAME, "--strict-mcp-config", "--mcp-config", MCP_CONFIG,
  "--dangerously-load-development-channels", "server:daisy-bell"];
const child = spawn("/usr/bin/python3", args, { cwd: HOME_DIR, stdio: ["pipe", "ignore", "inherit"], env: {
  ...process.env, TERM: "xterm-256color", ENABLE_CLAUDEAI_MCP_SERVERS: "false", [TAG[0]]: TAG[1],
  // Nobody watches this pseudo-terminal, but our startup keystrokes make Claude think {{OWNER}} is "active in this terminal",
  // and PushNotification then skips the phone. This turns that presence check off for this session only.
  CLAUDE_CODE_DISABLE_NOTIFICATION_PRESENCE_CHECK: "1",
  // Anthropic: "On the v2 runtime, a channel server that negotiates MCP protocol revision 2026-07-28 can't deliver channel
  // messages ... To keep a stdio channel server on the earlier handshake, set MCP_PROTOCOL_NEGOTIATION to legacy, which keeps
  // every server on it" (code.claude.com/docs/en/mcp). This session loads only daisy-bell. Claude Code before v2.1.221 ignores it.
  MCP_PROTOCOL_NEGOTIATION: "legacy",
} });
log(`bell session starting in ${HOME_DIR}`);

const prompts = { started: Date.now(), answered: new Set(), done: null };
let seen = 0, screen = "";
const watcher = setInterval(() => {
  let size;
  try { size = statSync(SCREEN).size; } catch { return; }
  if (size <= seen) return;
  const buf = Buffer.alloc(Math.min(size - seen, 1_000_000));
  const fd = openSync(SCREEN, "r");
  try { readSync(fd, buf, 0, buf.length, seen); } finally { closeSync(fd); }
  seen = size;
  // A prompt can arrive over two reads, so match against the recent startup screen, not just the newest bytes.
  screen = (screen + buf.toString("utf8").replace(ANSI, " ").replace(/\s+/g, " ").toLowerCase()).slice(-20_000);
  for (const p of promptsToAnswer(screen, prompts)) {
    log(`answering startup prompt: ${p.name}`);
    p.keys.forEach((k, i) => setTimeout(() => child.stdin.write(k), 1500 + i * 400));
  }
  if (prompts.done) {
    // Startup is over: stop reading the screen, so job text shown later can never trigger a keystroke.
    clearInterval(watcher);
    log(prompts.done === "rc" ? "remote control is up; no longer reading the screen" : "startup window over (90 s); no longer reading the screen");
  }
}, 1000);
setTimeout(() => { if (!prompts.done) { prompts.done = "time"; clearInterval(watcher); log("startup window over (90 s); no longer reading the screen"); } }, ANSWER_WINDOW_MS + 1000).unref();

// The session can stay up while its bell port is dead (the daisy-bell server crashed or never bound). After a start-up
// grace, three failed health checks in a row end the whole session; launchd (KeepAlive) then starts a fresh one.
let misses = 0;
setTimeout(() => setInterval(async () => {
  try { const r = await fetch(`http://127.0.0.1:${PORT}/health`, { signal: AbortSignal.timeout(3000) }); misses = r.ok ? 0 : misses + 1; } catch { misses++; }
  if (misses >= 3) {
    log(`bell port ${PORT} not answering (3 checks); ending the session so launchd starts a fresh one`);
    await hardKill({ tag: TAG }, { graceMs: 3000 });
    process.exit(1);
  }
}, 30_000), 90_000);

child.on("close", (code) => { clearInterval(watcher); log(`bell session exited (${code}); launchd restarts it`); process.exit(code || 1); });
const end = async () => { await hardKill({ tag: TAG }, { graceMs: 3000 }); process.exit(0); };
for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, end);
