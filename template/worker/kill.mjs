// Hard kill for a job's processes: SIGTERM every process group the job owns, wait up to the grace period, then SIGKILL.
// Claude Code runs each Bash tool command in its own process group, so killing the claude process (or its group) alone
// leaves the actual work running. The worker starts each job's claude in its own session (detached), and every process
// the job starts stays in that session, even after its parent dies, unless it starts a session of its own. A job's
// processes are found four ways, so a kill works even when the worker that started them is frozen or gone:
// the session recorded in the job folder's .run.json, the process tree under the job's root pid, the DAISY_JOB_DIR /
// DAISY_WORKER_TAG tags job processes inherit in their environment, and the sessions those tagged processes lead.
// (macOS hides the environment of Apple's own binaries, such as bash, perl and sleep, so tags alone miss some.)
// Shared by the worker (cancel, stop_all, timeout, startup cleanup), the supervisor (force_kill_job) and the bell.

import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Every process: pid, ppid, pgid, session, state, age in seconds, and its command line followed by its environment
// (ps -E; own processes only). Zombies are left out: they are already dead and only wait for their parent.
export function processTable() {
  let out = "";
  try { out = execFileSync("/bin/ps", ["-axE", "-ww", "-o", "pid=,ppid=,pgid=,stat=,etime=,command="], { maxBuffer: 64 << 20 }).toString(); } catch { return []; }
  const table = out.split("\n").map((l) => /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s(.*)$/.exec(l)).filter(Boolean)
    .map((m) => ({ pid: +m[1], ppid: +m[2], pgid: +m[3], stat: m[4], age: etimeSeconds(m[5]), text: m[6], sid: 0 }))
    .filter((p) => !p.stat.startsWith("Z"));
  // ps on macOS always shows session 0; getsid(2) knows the real one.
  try {
    const sids = execFileSync("/usr/bin/python3", ["-I", "-c", "import os,sys\nfor p in sys.stdin.read().split():\n try: print(p, os.getsid(int(p)))\n except Exception: pass"],
      { input: table.map((p) => p.pid).join(" "), maxBuffer: 16 << 20 }).toString();
    const by = new Map(sids.trim().split("\n").map((l) => l.split(" ").map(Number)));
    for (const p of table) p.sid = by.get(p.pid) || 0;
  } catch {}
  return table;
}

// ps etime: [[dd-]hh:]mm:ss
const etimeSeconds = (t) => { const [d, rest] = t.includes("-") ? t.split("-") : [0, t]; return rest.split(":").map(Number).reduce((a, n) => a * 60 + n, 0) + Number(d) * 86400; };

const hasTag = (text, name, value) => {
  const at = text.indexOf(`${name}=${value}`);
  if (at < 0) return false;
  const next = text[at + name.length + 1 + value.length];
  return next === undefined || next === " ";
};

// What the worker recorded for a job's run: { pid, sid, worker_tag }.
const readRun = (dir) => { try { return JSON.parse(readFileSync(join(dir, ".run.json"), "utf8")); } catch { return null; } };

// The processes that belong to a job (or to every job a worker started, by its worker tag).
// match: { jobDir?, workerTag?, jobsRoot? (with workerTag: where the job folders are), tag?: [name, value], rootPid? }.
// Never returns this process, its parent, pid 1, or anything in this process's own session.
export function findProcs(match, table = processTable()) {
  const me = table.find((p) => p.pid === process.pid);
  const keep = new Set([0, 1, process.pid, process.ppid]);
  const keepSid = new Set([0, 1, me?.sid || 0]);
  const mine = new Set();
  const sids = new Set();
  const tagged = (p) => (match.jobDir && hasTag(p.text, "DAISY_JOB_DIR", match.jobDir)) || (match.workerTag && hasTag(p.text, "DAISY_WORKER_TAG", match.workerTag)) ||
    (match.tag && hasTag(p.text, match.tag[0], match.tag[1]));
  for (const p of table) {
    if (keep.has(p.pid) || !tagged(p)) continue;
    mine.add(p.pid);
    if (p.sid === p.pid) sids.add(p.sid); // a tagged session leader: the job's own session
  }
  // Sessions the worker recorded (they outlive their leader).
  const runs = [];
  if (match.jobDir) runs.push(readRun(match.jobDir));
  if (match.workerTag && match.jobsRoot) {
    let names = [];
    try { names = readdirSync(match.jobsRoot); } catch {}
    for (const n of names) { const r = readRun(join(match.jobsRoot, n)); if (r?.worker_tag === match.workerTag) runs.push(r); }
  }
  for (const r of runs) if (r && Number(r.sid)) sids.add(Number(r.sid));
  const root = match.rootPid && table.find((p) => p.pid === match.rootPid);
  if (root && !keep.has(root.pid)) { mine.add(root.pid); if (root.sid === root.pid) sids.add(root.sid); }
  for (const p of table) if (!keep.has(p.pid) && sids.has(p.sid) && !keepSid.has(p.sid)) mine.add(p.pid);
  // Children of anything found so far (a process may have cleared its environment or started its own session).
  for (let grew = true; grew;) {
    grew = false;
    for (const p of table) if (!mine.has(p.pid) && !keep.has(p.pid) && mine.has(p.ppid)) { mine.add(p.pid); grew = true; }
  }
  return table.filter((p) => mine.has(p.pid));
}

// Process groups safe to signal as a whole: every member is one of the job's processes.
function groups(procs, table) {
  const ids = new Set(procs.map((p) => p.pid));
  return [...new Set(procs.map((p) => p.pgid))].filter((g) => g > 1 && table.filter((p) => p.pgid === g).every((p) => ids.has(p.pid)));
}

function signal(procs, table, sig) {
  for (const g of groups(procs, table)) try { process.kill(-g, sig); } catch {}
  for (const p of procs) try { process.kill(p.pid, sig); } catch {}
}

// SIGTERM, wait up to graceMs for everything to go, then SIGKILL what is left (found again, so orphans are caught too).
// Returns { found, pids, termed_ms, killed, left }: killed = how many needed SIGKILL; left = still alive after it.
export async function hardKill(match, { graceMs = 30_000, log = () => {} } = {}) {
  const t0 = Date.now();
  let table = processTable();
  let procs = findProcs(match, table);
  const pids = procs.map((p) => p.pid), found = procs.length;
  if (!procs.length) return { found: 0, pids, termed_ms: 0, killed: 0, left: 0 };
  log(`hard kill: SIGTERM to ${procs.length} process(es) in ${groups(procs, table).length} group(s)`);
  // A stopped process can't act on SIGTERM; wake it so it may exit cleanly.
  signal(procs, table, "SIGTERM");
  for (const p of procs) if (p.stat.includes("T")) try { process.kill(p.pid, "SIGCONT"); } catch {}
  // pid -> command line, so a pid reused by an unrelated process during the wait is never signalled.
  const seen = new Map(procs.map((p) => [p.pid, p.text]));
  const again = (t) => {
    const ids = new Set(findProcs(match, t).map((p) => p.pid));
    return t.filter((p) => ids.has(p.pid) || seen.get(p.pid) === p.text);
  };
  while (Date.now() - t0 < graceMs) {
    await sleep(500);
    table = processTable();
    procs = again(table);
    for (const p of procs) if (!seen.has(p.pid)) { seen.set(p.pid, p.text); signal([p], table, "SIGTERM"); } // started after the first sweep
    if (!procs.length) return { found, pids, termed_ms: Date.now() - t0, killed: 0, left: 0 };
  }
  log(`hard kill: ${procs.length} process(es) ignored SIGTERM for ${Math.round(graceMs / 1000)} s; SIGKILL`);
  const killed = procs.length;
  signal(procs, table, "SIGKILL");
  await sleep(300);
  const left = again(processTable()).length;
  return { found, pids, termed_ms: Date.now() - t0, killed, left };
}

// Every job a worker tag owns, by job folder (for status reports): jobs with a recorded run of that tag, and any tagged
// process, each with all of its processes.
export function jobsRunning(workerTag, jobsRoot, table = processTable()) {
  const dirs = new Set();
  if (jobsRoot) {
    let names = [];
    try { names = readdirSync(jobsRoot); } catch {}
    for (const n of names) if (readRun(join(jobsRoot, n))?.worker_tag === workerTag) dirs.add(join(jobsRoot, n));
  }
  for (const p of table) {
    const m = / DAISY_JOB_DIR=(\S+)/.exec(p.text);
    if (m && (!workerTag || hasTag(p.text, "DAISY_WORKER_TAG", workerTag))) dirs.add(m[1]);
  }
  const out = {};
  for (const d of dirs) { const ps = findProcs({ jobDir: d }, table); if (ps.length) out[d] = ps; }
  return out;
}
