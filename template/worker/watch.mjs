// Job watch: the supervisor's check-ins and self-healing for running jobs (job 94c3a255). Runs inside worker/supervisor.mjs
// (the emergency lane), never in the agent, so a hung command can't hide a stall and the agent never stops or waits for it.
// - Heartbeat: the job hook stamps .heartbeat on every step and tool call. Silent for silenceMinutes (12) while the job's
//   processes use no CPU and change no files = a stall. Silent but busy (CPU or files moving) is given up to busyCapMinutes.
// - Check-in: about every checkinMinutes (60) a short report (what got done, what's next, still working) goes to CHECKINS.md
//   in the job folder and to the connector (get_job, check_updates). Written from the job's own activity; costs the agent nothing.
// - Progress: a check-in window counts as progress when it has new steps (new files read or written, new searches, pages,
//   commands, drafts; digits folded), new or changed files, or new commits. Two windows in a row without = a stall.
// - Recovery: write .recover.json (why, the hung step, the processes, what to do) and RECOVERIES.md, kill the job's processes;
//   the worker sees the marker and resumes the session with a different approach. After maxRecoveries the job is blocked
//   with the diagnosis. A hang waiting on a sign-in, password or permission goes to {{OWNER}} once instead (needs_approval).
// Only runs the worker marked watch: true in .run.json are watched (a worker from before this change has its own time limit).

import { readFileSync, writeFileSync, appendFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, relative, sep } from "node:path";
import { findProcs, hardKill, processTable } from "./kill.mjs";

export const WATCH_DEFAULTS = { silenceMinutes: 12, busyCapMinutes: 45, checkinMinutes: 60, maxRecoveries: 3, sampleSeconds: 60, timeScale: 1, busyCpuSeconds: 0.5 };
const NOTE_FILES = new Set(["CHECKINS.md", "RECOVERIES.md"]); // our own notes never count as the job's progress
const SCAN_MAX = 3000;

const readJson = (f) => { try { return JSON.parse(readFileSync(f, "utf8")); } catch { return null; } };
const mtime = (f) => { try { return statSync(f).mtimeMs; } catch { return 0; } };
const clip = (t, n) => { const s = String(t || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

// Sign-ins, passwords and permissions only {{OWNER}} can give. Matched against the hung processes and the step that hung.
const NEEDS_OWNER = [
  [/\bsudo\b/, "an administrator password (a sudo command was waiting for it)"],
  [/\bgh auth login\b/, "a GitHub sign-in (gh auth login)"],
  [/\b(?:npm|yarn|pnpm) (?:login|adduser)\b/, "an npm sign-in"],
  [/\bgcloud auth\b/, "a Google Cloud sign-in (gcloud auth)"],
  [/\bwrangler login\b/, "a Cloudflare sign-in (wrangler login)"],
  [/\bop signin\b/, "a 1Password sign-in"],
  [/\bclaude (?:login|auth login|setup-token)\b/, "a Claude sign-in"],
  [/\bcomposio (?:login|link|add)\b/, "a Composio sign-in"],
  [/\bsecurity unlock-keychain\b/, "a keychain unlock"],
  [/\bssh-add\b|\bpinentry\b|\bgpg\b.*--(?:sign|decrypt)/, "a key passphrase"],
  [/with administrator privileges/, "an administrator password"],
  [/x-apple\.systempreferences|\btccutil\b/, "a macOS privacy permission"],
];
export function needsOwner(texts) {
  for (const t of texts) for (const [re, what] of NEEDS_OWNER) if (re.test(String(t || ""))) return what;
  return null;
}

// .steps.log lines from the hook: { at (ms), phase, tool, key }.
export function readSteps(dir, sinceMs = 0) {
  let text = "";
  try { text = readFileSync(join(dir, ".steps.log"), "utf8"); } catch { return []; }
  return text.split("\n").map((l) => l.split("\t")).filter((f) => f.length === 4)
    .map(([at, phase, tool, key]) => ({ at: Date.parse(at), phase, tool, key })).filter((s) => s.at > sinceMs);
}

const KIND = (tool) => /^(Read|NotebookRead)$/.test(tool) ? "read" : /^(Glob|Grep)$/.test(tool) ? "search" : /^Web/.test(tool) ? "web"
  : /^(Edit|MultiEdit|Write|NotebookEdit)$/.test(tool) ? "write" : tool === "Bash" ? "command" : /^mcp__(cua|host)-lane__/.test(tool) ? "screen"
  : tool === "TodoWrite" ? "checklist" : "other";
const KIND_WORDS = { read: "reads", search: "file searches", web: "web searches or pages", write: "edits or drafts", command: "commands", screen: "screen actions", checklist: "checklist updates", other: "other steps" };

// Files in the job folder (no dot files, not our notes), and the project's git state or top-level files.
export function snapshot(dir, cwd) {
  const files = {};
  let n = 0;
  const walk = (d) => {
    let ents = [];
    try { ents = readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (n >= SCAN_MAX || e.name.startsWith(".") || e.name === "node_modules") continue;
      const p = join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && !(d === dir && NOTE_FILES.has(e.name))) { try { const st = statSync(p); files[relative(dir, p).split(sep).join("/")] = `${st.size}:${Math.round(st.mtimeMs)}`; n++; } catch {} }
    }
  };
  walk(dir);
  let head = null;
  if (cwd && cwd !== dir) {
    const git = (args) => execFileSync("/usr/bin/git", ["-C", cwd, ...args], { timeout: 20_000, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 8 << 20 }).toString();
    try {
      head = git(["rev-parse", "HEAD"]).trim();
      for (const l of git(["status", "--porcelain", "--untracked-files=normal"]).split("\n").filter(Boolean).slice(0, SCAN_MAX)) {
        const f = l.slice(3);
        files[`@project/${f}`] = `${l.slice(0, 2)}:${Math.round(mtime(join(cwd, f.replace(/^"|"$/g, ""))))}`;
      }
    } catch {
      head = null;
      try { for (const e of readdirSync(cwd).slice(0, 500)) if (!e.startsWith(".")) files[`@project/${e}`] = String(Math.round(mtime(join(cwd, e)))); } catch {}
    }
  }
  return { files, head };
}

// What changed between two snapshots: new files, changed files, new commits.
export function diffSnap(a, b, cwd) {
  const before = a?.files || {}, after = b.files;
  const added = Object.keys(after).filter((f) => !(f in before));
  const changed = Object.keys(after).filter((f) => f in before && before[f] !== after[f]);
  let commits = [];
  if (a?.head && b.head && a.head !== b.head && cwd) {
    try { commits = execFileSync("/usr/bin/git", ["-C", cwd, "log", "--format=%s", `${a.head}..${b.head}`], { timeout: 20_000, stdio: ["ignore", "pipe", "ignore"] }).toString().split("\n").filter(Boolean); } catch { commits = ["(new commit)"]; }
  }
  return { added, changed, commits };
}

// Did this check-in window move the job forward? Research and writing count: new reads, searches, pages and drafts are new steps.
export function judge(steps, seen, diff) {
  const pre = steps.filter((s) => s.phase === "pre");
  const novel = new Set(pre.map((s) => s.key).filter((k) => !seen.has(k)));
  const files = diff.added.length + diff.changed.length;
  const progress = novel.size >= 2 || diff.added.length > 0 || diff.commits.length > 0 || (files > 0 && novel.size >= 1);
  const reason = progress
    ? [novel.size && `${novel.size} new step(s)`, diff.added.length && `${diff.added.length} new file(s)`, diff.changed.length && `${diff.changed.length} changed file(s)`, diff.commits.length && `${diff.commits.length} commit(s)`].filter(Boolean).join(", ")
    : !pre.length ? "no steps at all" : `${pre.length} step(s) but only ${new Set(pre.map((s) => s.key)).size} different one(s), ${novel.size} new, no new files or commits`;
  return { progress, reason, novel: novel.size, steps: pre.length };
}

const dur = (ms) => { const m = Math.round(ms / 60000); return m < 90 ? `${m} min` : `${(m / 60).toFixed(1)} h`; };

// The hourly report, in plain words.
export function checkinText({ n, elapsedMs, steps, diff, verdict, progress, activity }) {
  const kinds = {};
  for (const s of steps.filter((x) => x.phase === "pre")) kinds[KIND(s.tool)] = (kinds[KIND(s.tool)] || 0) + 1;
  const did = Object.entries(kinds).sort((a, b) => b[1] - a[1]).map(([k, c]) => `${c} ${KIND_WORDS[k]}`).join(", ") || "no steps";
  const names = [...diff.added, ...diff.changed].map((f) => f.replace(/^@project\//, ""));
  const lines = [
    `Check-in ${n} (${dur(elapsedMs)} in): still working.`,
    `Done since the last check-in: ${did}.${names.length ? ` Files: ${names.slice(0, 6).join(", ")}${names.length > 6 ? ` and ${names.length - 6} more` : ""}.` : ""}${diff.commits.length ? ` Commits: ${diff.commits.slice(0, 3).map((c) => `"${clip(c, 60)}"`).join(", ")}${diff.commits.length > 3 ? ` and ${diff.commits.length - 3} more` : ""}.` : ""}`,
    activity.length ? `Recent steps: ${activity.slice(-3).map((a) => clip(a, 70)).join("; ")}.` : "",
    `Now: ${clip(progress?.step || "no step reported", 120)}.${progress?.next ? ` Next on its checklist: ${clip(progress.next, 80)}.` : ""}${progress?.total ? ` Checklist ${progress.done || 0} of ${progress.total} done.` : ""}`,
    `Progress: ${verdict.progress ? "yes" : "NO"} (${verdict.reason}).`,
  ];
  return lines.filter(Boolean).join(" ");
}

function activityLines(dir, sinceMs) {
  try {
    return readFileSync(join(dir, ".activity.log"), "utf8").split("\n").filter(Boolean)
      .filter((l) => Date.parse(l.slice(0, 24)) > sinceMs).map((l) => l.replace(/^\S+ /, ""));
  } catch { return []; }
}

// CPU seconds used so far by these processes (ps time: [dd-]hh:mm:ss.cc or mm:ss.cc).
function cpuSeconds(pids) {
  if (!pids.length) return 0;
  let out = "";
  try { out = execFileSync("/bin/ps", ["-o", "time=", "-p", pids.join(",")], { stdio: ["ignore", "pipe", "ignore"] }).toString(); } catch (e) { out = String(e.stdout || ""); }
  return out.split("\n").map((t) => t.trim()).filter(Boolean).reduce((sum, t) => {
    const [d, rest] = t.includes("-") ? t.split("-") : [0, t];
    return sum + rest.split(":").map(Number).reduce((a, x) => a * 60 + x, 0) + Number(d) * 86400;
  }, 0);
}

// One watcher per supervisor. ctx: { jobsRoot, workerTag, cfg (WATCH_DEFAULTS overrides), api(route, body), log }.
export function makeWatcher(ctx) {
  const cfg = { ...WATCH_DEFAULTS, ...(ctx.cfg || {}) };
  const scale = Math.max(1, Number(cfg.timeScale) || 1); // tests run the clock faster: 60 = one real second per simulated minute
  const MS = { silence: cfg.silenceMinutes * 60000 / scale, busyCap: cfg.busyCapMinutes * 60000 / scale, checkin: cfg.checkinMinutes * 60000 / scale };
  const log = ctx.log || (() => {});
  const mem = new Map(); // dir -> { run, cpu, cpuAt }
  let wakeAt = 0, lastTick = 0;

  const simMs = (ms) => ms * scale;

  async function post(body) {
    if (!ctx.api) return;
    for (let i = 0; i < 3; i++) { try { await ctx.api("checkin", body); return; } catch { await new Promise((r) => setTimeout(r, 1000)); } }
    log(`job ${body.id}: could not send the ${body.recovery ? "recovery" : "check-in"} to the connector`);
  }

  async function recover(dir, run, st, cause, why) {
    const id = run.job_id || dir.split(sep).pop();
    const table = processTable();
    const procs = findProcs({ jobDir: dir }, table);
    const steps = readSteps(dir);
    const last = steps[steps.length - 1];
    const prog = readJson(join(dir, ".progress.json")) || {};
    const inFlight = last?.phase === "pre" ? prog.step || last.tool : null;
    const procText = procs.filter((p) => p.pid !== run.pid).map((p) => `${clip(p.text.split(/ [A-Z_][A-Z0-9_]*=/)[0], 110)} (pid ${p.pid}${p.stat.includes("T") ? ", stopped" : ""}, up ${dur(simMs(p.age * 1000))})`);
    const owner = cause === "silent" ? needsOwner([...procs.filter((p) => p.pid !== run.pid).map((p) => p.text.split(/ [A-Z_][A-Z0-9_]*=/)[0]), inFlight]) : null;
    const n = (st.recoveries || 0) + 1;
    const decision = owner ? "needs_owner" : n > cfg.maxRecoveries ? "blocked" : "resume";
    const rec = { n, at: new Date().toISOString(), cause, why, step: inFlight || prog.step || null, procs: procText.slice(0, 8), recent: activityLines(dir, 0).slice(-8),
      decision, needs_owner: owner, max: cfg.maxRecoveries };
    writeFileSync(join(dir, ".recover.json"), JSON.stringify(rec, null, 1));
    const action = decision === "resume" ? `Killing the stuck processes and resuming with a different approach (attempt ${n} of ${cfg.maxRecoveries}).`
      : decision === "needs_owner" ? `It was waiting for ${owner}, which only {{OWNER}} can give: stopping it and asking {{HIM}} once.`
      : `Already recovered ${n - 1} time(s) without it sticking: stopping it and marking it blocked.`;
    appendFileSync(join(dir, "RECOVERIES.md"), `\n## ${decision === "resume" ? `Recovery ${n}` : decision === "needs_owner" ? "Needs {{OWNER}}" : "Blocked"}, ${rec.at}\n` +
      `- Why: ${why}\n- Step: ${rec.step || "none reported"}\n${procText.length ? `- Processes: ${procText.slice(0, 8).join("; ")}\n` : ""}` +
      `${rec.recent.length ? `- Last steps: ${rec.recent.slice(-5).map((a) => clip(a, 80)).join(" | ")}\n` : ""}- Action: ${action}\n`);
    log(`job ${id} STALL (${cause}): ${why} -> ${decision}${owner ? ` (${owner})` : ""}; ${procs.length} process(es)`);
    st.recoveries = decision === "resume" ? n : st.recoveries || 0;
    st.no_progress = 0;
    st.recovering = rec.at;
    writeFileSync(join(dir, ".watch.json"), JSON.stringify(st));
    post({ id, recovery: { n, at: rec.at, cause, why: clip(why, 300), step: clip(rec.step, 160), decision, needs_owner: owner, action } }).catch(() => {});
    const k = await hardKill({ jobDir: dir }, { graceMs: 3000, log: (m) => log(`job ${id} ${m}`) });
    // Only now may the worker start the next run: one started during the kill's grace period would be killed with it.
    writeFileSync(join(dir, ".recover.json"), JSON.stringify({ ...rec, killed_at: new Date().toISOString(), killed: k.found }, null, 1));
    log(`job ${id} recovery kill: ${k.found} process(es)${k.killed ? `, ${k.killed} by SIGKILL` : ""}`);
    return rec;
  }

  async function checkin(dir, run, st, now) {
    const since = st.last_checkin_ms || run.started_ms;
    const steps = readSteps(dir, since);
    const snap = snapshot(dir, run.cwd);
    const diff = diffSnap(st.snap, snap, run.cwd);
    const seen = new Set(st.seen || []);
    const verdict = judge(steps, seen, diff);
    for (const s of steps) seen.add(s.key);
    st.seen = [...seen].slice(-5000);
    st.snap = snap;
    st.checkins = (st.checkins || 0) + 1;
    st.last_checkin_ms = now;
    st.no_progress = verdict.progress ? 0 : (st.no_progress || 0) + 1;
    const text = checkinText({ n: st.checkins, elapsedMs: simMs(now - run.started_ms), steps, diff, verdict, progress: readJson(join(dir, ".progress.json")), activity: activityLines(dir, since) });
    const at = new Date(now).toISOString();
    appendFileSync(join(dir, "CHECKINS.md"), `${existsSync(join(dir, "CHECKINS.md")) ? "" : "# Check-ins (written by {{ASSISTANT}}'s supervisor about every hour; the agent keeps working)\n"}\n## ${at}\n${text}\n`);
    writeFileSync(join(dir, ".watch.json"), JSON.stringify(st));
    const id = run.job_id || dir.split(sep).pop();
    log(`job ${id} check-in ${st.checkins}: progress ${verdict.progress ? "yes" : "NO"} (${verdict.reason})${st.no_progress ? `, ${st.no_progress} in a row without` : ""}`);
    post({ id, checkin: { n: st.checkins, at, text: clip(text, 1500), progress: verdict.progress, no_progress: st.no_progress } }).catch(() => {});
    return verdict;
  }

  async function watchJob(dir, now) {
    const run = readJson(join(dir, ".run.json"));
    if (!run?.watch || run.worker_tag !== ctx.workerTag || existsSync(join(dir, ".stop")) || existsSync(join(dir, ".recover.json"))) return;
    run.at_ms = Date.parse(run.at) || now;
    run.started_ms = Date.parse(run.job_started || run.at) || run.at_ms;
    let st = readJson(join(dir, ".watch.json")) || {};
    if (st.job_started !== run.job_started) st = { job_started: run.job_started, last_checkin_ms: run.started_ms, snap: snapshot(dir, run.cwd), seen: readSteps(dir).map((s) => s.key) };
    const m = mem.get(dir) || {};
    if (m.run !== run.at) { mem.set(dir, { run: run.at }); delete st.recovering; writeFileSync(join(dir, ".watch.json"), JSON.stringify(st)); return; } // a new run: start fresh
    // Heartbeat: the hook's last stamp, the run's start, or the Mac waking from sleep, whichever is latest.
    const hb = Math.max(mtime(join(dir, ".heartbeat")), mtime(join(dir, ".progress.json")), run.at_ms, wakeAt);
    const silent = now - hb;
    if (silent >= MS.silence) {
      const procs = findProcs({ jobDir: dir }); // run.pid leads the recorded session, which findProcs checks is still the run's
      if (!procs.length) return; // the run already ended; the worker takes it from here
      // CPU of what the session started (tool commands, lane servers), not claude itself, which only waits while a tool runs.
      const cpu = cpuSeconds(procs.filter((p) => p.pid !== run.pid).map((p) => p.pid));
      const busyCpu = m.cpuAt && cpu - m.cpu >= cfg.busyCpuSeconds;
      const busyFiles = Object.values(snapshot(dir, null).files).some((v) => Number(v.split(":")[1]) > hb);
      const first = !m.cpuAt;
      m.cpu = cpu; m.cpuAt = now; mem.set(dir, { ...m, run: run.at });
      if (first) return; // need two samples to tell idle from busy
      if ((busyCpu || busyFiles) && silent < MS.busyCap) return;
      const why = busyCpu || busyFiles
        ? `no step or tool call for ${dur(simMs(silent))} although it is still ${busyCpu ? "using CPU" : "writing files"} (the Bash tool itself gives up after 10 minutes, so this is a runaway command)`
        : `no step or tool call for ${dur(simMs(silent))} and its processes are idle (no CPU, no file changes): a frozen command or a hung session`;
      return recover(dir, run, st, busyCpu || busyFiles ? "busy" : "silent", why);
    }
    m.cpuAt = 0; mem.set(dir, { ...m, run: run.at });
    if (now - (st.last_checkin_ms || run.started_ms) >= MS.checkin) {
      const v = await checkin(dir, run, st, now);
      if (!v.progress && st.no_progress >= 2) {
        return recover(dir, run, st, "no-progress", `two check-ins in a row without real progress (${v.reason}); it looks stuck in a loop`);
      }
    }
  }

  let busy = false;
  return async function tick() {
    if (busy) return;
    busy = true;
    try {
      const now = Date.now();
      // A gap in our own loop means the Mac slept (or this process was stopped): silence during it is not the job's fault.
      if (lastTick && now - lastTick > Math.max(90_000, cfg.sampleSeconds * 3000 / scale)) { wakeAt = now; log(`watch: loop was paused ${Math.round((now - lastTick) / 1000)} s (sleep?); heartbeats counted from now`); }
      lastTick = now;
      let names = [];
      try { names = readdirSync(ctx.jobsRoot); } catch {}
      for (const n of names) {
        const dir = join(ctx.jobsRoot, n);
        if (!existsSync(join(dir, ".run.json"))) { mem.delete(dir); continue; }
        try { await watchJob(dir, now); } catch (e) { log(`watch ${n}: ${e.message}`); }
      }
    } finally { busy = false; }
  };
}
