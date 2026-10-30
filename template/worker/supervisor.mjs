// {{ASSISTANT}} supervisor: the emergency control lane on the {{MACHINE}}. Its own launchd agent (com.daisy.supervisor), separate
// from the worker, so it keeps working when the worker or the job queue is jammed, hung or frozen. Every few seconds it
// asks the connector for control commands (force_kill_job, restart_worker, worker_status, and the stops behind cancel_job
// and stop_all) and carries them out directly: process kills, launchctl, local checks. It watches every running job's
// heartbeat, writes its hourly check-ins and recovers stalled jobs on its own (worker/watch.mjs); restarts a worker whose
// loop froze; pushes a stalled job to {{OWNER}}'s phone only when self-recovery hasn't fixed it, and restarts the phone bell if it
// stops answering. Outbound requests to Cloudflare only, plus the local bell.
//
// run_command (Desktop Commander for voice) runs here too, through worker/shell-lane.mjs.
//
// Usage: node worker/supervisor.mjs [--config <worker config>]   (launchd: com.daisy.supervisor)

import { readFileSync, writeFileSync, statSync, existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { hardKill, processTable, jobsRunning } from "./kill.mjs";
import { runShell } from "./shell-lane.mjs";
import { powerRefusal } from "./power.mjs";
import { envSecrets, installSecrets } from "./redact.mjs";
import { makeWatcher, WATCH_DEFAULTS } from "./watch.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const cfgPath = argv.includes("--config") ? argv[argv.indexOf("--config") + 1] : join(ROOT, "worker", "config.json");
const CFG = JSON.parse(readFileSync(cfgPath, "utf8"));
const SUP = CFG.supervisor || {};
const KEY = readFileSync(join(ROOT, CFG.keyFile), "utf8").trim();
// The same tag the worker gives its job processes (worker.mjs).
const WORKER_TAG = CFG.workerTag || (resolve(cfgPath) === join(ROOT, "worker", "config.json") ? "live" : `cfg-${createHash("sha256").update(resolve(cfgPath)).digest("hex").slice(0, 10)}`);
const WORKER_LABEL = SUP.workerLabel || "com.daisy.handoff-worker";
const BELL_LABEL = SUP.bellLabel || "com.daisy.jarvis-bell";
const POLL_MS = (SUP.pollSeconds || 2) * 1000;
// Idle (nothing queued or running at the connector, no command in the last minute): a slower poll, to spend fewer of the
// Cloudflare account's daily requests. Not set: always POLL_MS.
const IDLE_POLL_MS = (SUP.idlePollSeconds || SUP.pollSeconds || 2) * 1000;
const BUSY_HOLD_MS = 60_000;
const KILL_GRACE_MS = (CFG.killGraceSeconds ?? 30) * 1000;
const ALIVE_FILE = resolve(ROOT, CFG.aliveFile || "logs/.worker-alive");
const BELL_HEALTH = SUP.bellHealthUrl || (CFG.bell?.url ? CFG.bell.url.replace(/\/notify$/, "/health") : null);
const BELL_HEAL_MS = (SUP.bellHealSeconds ?? 120) * 1000; // bell silent this long (and launchd didn't bring it back): kickstart it
const SHELL_LOG = SUP.shellLog ? resolve(ROOT, SUP.shellLog) : undefined; // undefined: shell-lane's own default, logs/shell.log
const WATCH = { ...WATCH_DEFAULTS, ...(SUP.watch || {}) };
// The worker's loop touches its alive file every few seconds; silent this long while launchd says it runs = frozen: restart it.
const WORKER_HEAL_MS = (SUP.workerHealMinutes ?? 10) * 60_000 / Math.max(1, Number(WATCH.timeScale) || 1);
const UID = process.getuid();
const START = Date.now();

const log = (...a) => console.log(new Date().toISOString(), ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(route, body = {}) {
  const res = await fetch(`${CFG.base}/api/${route}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`api ${route} -> HTTP ${res.status}`);
  return res.json();
}

const run = (bin, args, timeoutMs = 20_000) => new Promise((done) =>
  execFile(bin, args, { timeout: timeoutMs }, (err, out, errOut) => done({ code: err ? err.code ?? -1 : 0, out: String(out).trim(), err: String(errOut).trim() })));

// launchd's view of one of our agents: loaded?, its pid, its state.
async function agent(label) {
  const r = await run("/bin/launchctl", ["print", `gui/${UID}/${label}`]);
  if (r.code !== 0) return { loaded: false };
  const get = (k) => new RegExp(`^\\s*${k} = (.*)$`, "m").exec(r.out)?.[1];
  return { loaded: true, pid: Number(get("pid")) || null, state: get("state") || "?", runs: Number(get("runs")) || 0 };
}

const procState = (pid) => processTable().find((p) => p.pid === pid);
const frozen = (p) => !!p && p.stat.includes("T");
const aliveAge = () => { try { return Math.round((Date.now() - statSync(ALIVE_FILE).mtimeMs) / 1000); } catch { return null; } };
const mins = (sec) => (sec < 120 ? `${sec} s` : sec < 7200 ? `${Math.round(sec / 60)} min` : `${(sec / 3600).toFixed(1)} h`);

async function bellUp() {
  if (!BELL_HEALTH) return null;
  try { const r = await fetch(BELL_HEALTH, { signal: AbortSignal.timeout(3000) }); return r.ok; } catch { return false; }
}

const bellKey = () => { try { return readFileSync(join(ROOT, CFG.bell.keyFile), "utf8").trim(); } catch { return ""; } };
async function ring(ev) {
  const res = await fetch(CFG.bell.url, { method: "POST", headers: { "Content-Type": "application/json", "X-Bell-Key": bellKey() }, body: JSON.stringify(ev), signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`bell -> HTTP ${res.status}`);
}

// ---- Commands ----

const jobDir = (id) => join(ROOT, "jobs", id);
const safeId = (id) => /^[0-9a-f]{8}$/.test(String(id || ""));

// stop: what cancel_job and stop_all ask for (SIGTERM, then SIGKILL after the grace period). kill: force_kill_job (SIGKILL now).
async function stopJob(id, force) {
  if (!safeId(id)) return { error: `bad job id ${id}` };
  const dir = jobDir(id);
  if (existsSync(dir)) try { writeFileSync(join(dir, ".stop"), new Date().toISOString()); } catch {} // the hook refuses every further action
  const k = await hardKill({ jobDir: dir }, { graceMs: force ? 0 : KILL_GRACE_MS, log: (m) => log(`job ${id} ${m}`) });
  log(`job ${id} ${force ? "force-killed" : "stopped"}: ${k.found} process(es)${k.killed ? `, ${k.killed} by SIGKILL` : ""} in ${(k.termed_ms / 1000).toFixed(1)} s${k.left ? `, ${k.left} STILL ALIVE` : ""}`);
  return k;
}

async function waitFor(test, ms, step = 500) {
  const until = Date.now() + ms;
  for (;;) { const v = await test(); if (v) return v; if (Date.now() > until) return null; await sleep(step); }
}

async function restartWorker() {
  const t0 = Date.now();
  const before = await agent(WORKER_LABEL);
  if (!before.loaded) return { error: "not loaded", text: `The worker's launchd agent ${WORKER_LABEL} is not loaded, so it can't be restarted from here. {{OWNER}}'s step: launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/${WORKER_LABEL}.plist` };
  const p = before.pid ? procState(before.pid) : null;
  const was = !before.pid ? "not running" : frozen(p) ? `frozen (stopped) as pid ${before.pid}` : `running as pid ${before.pid}`;
  // SIGKILL works on a frozen process too; then the jobs it left go (they carry its tag), and launchd starts it now.
  if (before.pid) try { process.kill(before.pid, "SIGKILL"); } catch {}
  await waitFor(() => !procState(before.pid), 5000, 200);
  const orphans = await hardKill({ workerTag: WORKER_TAG, jobsRoot: join(ROOT, "jobs") }, { graceMs: 5000 });
  const ks = await run("/bin/launchctl", ["kickstart", "-k", `gui/${UID}/${WORKER_LABEL}`]);
  const after = await waitFor(async () => { const a = await agent(WORKER_LABEL); return a.pid && a.pid !== before.pid ? a : null; }, 20_000);
  // Up = its loop has run since the restart (it touches the alive file every loop).
  const looping = after && await waitFor(() => { try { return statSync(ALIVE_FILE).mtimeMs > t0; } catch { return false; } }, 45_000);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const jobs = orphans.found ? ` Ended ${orphans.found} job process(es) it had left running; those jobs go back in the queue unless {{OWNER}} asked to stop them.` : "";
  if (!after) return { error: "no new pid", was, text: `Tried to restart the worker (it was ${was}) but launchd did not start a new one within 20 seconds${ks.code ? ` (kickstart: ${ks.err.slice(0, 120)})` : ""}.${jobs}` };
  log(`worker restarted: was ${was}, now pid ${after.pid}, ${looping ? "looping" : "not looping yet"} after ${secs} s`);
  return { ok: true, was, pid: after.pid, looping: !!looping, secs: Number(secs), orphans: orphans.found,
    text: `Restarted the worker: it was ${was}; now running as pid ${after.pid}${looping ? `, working again after ${secs} seconds` : ", started but not checking in yet"}.${jobs}` };
}

async function restartBell() {
  const t0 = Date.now();
  const before = await agent(BELL_LABEL);
  if (!before.loaded) return { error: "not loaded", text: `The phone bell's launchd agent ${BELL_LABEL} is not loaded. {{OWNER}}'s step: launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/${BELL_LABEL}.plist` };
  const ks = await run("/bin/launchctl", ["kickstart", "-k", `gui/${UID}/${BELL_LABEL}`]);
  const up = await waitFor(() => bellUp(), 60_000, 1000);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  log(`bell restarted: ${up ? `answering after ${secs} s` : "not answering yet"}`);
  return up ? { ok: true, secs: Number(secs), text: `Restarted the phone bell; it answers again after ${secs} seconds.` }
    : { error: "bell not answering", text: `Restarted the phone bell${ks.code ? ` (kickstart: ${ks.err.slice(0, 120)})` : ""} but it is not answering after 60 seconds.` };
}

async function restart(what) {
  if (what === "bell") return restartBell();
  const w = await restartWorker();
  if (what !== "both") return w;
  const b = await restartBell();
  return { ok: !!(w.ok && b.ok), worker: w, bell: b, text: `${w.text} ${b.text}`, ...(w.ok && b.ok ? {} : { error: "partly failed" }) };
}

// What is really happening on the {{MACHINE}}, in plain words.
async function status() {
  const table = processTable();
  const w = await agent(WORKER_LABEL), b = await agent(BELL_LABEL);
  const wp = w.pid ? table.find((p) => p.pid === w.pid) : null;
  const age = aliveAge();
  const parts = [];
  if (!w.loaded) parts.push(`Worker: launchd agent not loaded.`);
  else if (!w.pid) parts.push(`Worker: not running (launchd state ${w.state}); launchd should start it within 30 seconds.`);
  else if (frozen(wp)) parts.push(`Worker: FROZEN (process stopped) as pid ${w.pid}; restart_worker fixes it.`);
  else parts.push(`Worker: running as pid ${w.pid} for ${mins(wp?.age || 0)}${age === null ? "" : age > 120 ? `, but its loop has not run for ${mins(age)} (hung?); restart_worker fixes it` : `, loop ran ${age} s ago`}.`);
  const up = await bellUp();
  parts.push(`Phone bell: ${!b.loaded ? "launchd agent not loaded" : !b.pid ? "not running" : up ? `answering (pid ${b.pid})` : `running as pid ${b.pid} but not answering`}.`);
  const jobs = Object.entries(jobsRunning(WORKER_TAG, join(ROOT, "jobs"), table));
  parts.push(jobs.length ? `Job processes running (${jobs.length} job(s)): ${jobs.map(([dir, ps]) => {
    const oldest = Math.max(...ps.map((p) => p.age)), stopped = ps.some(frozen);
    return `${dir.split("/").pop()} (${ps.length} process(es), up ${mins(oldest)}${stopped ? ", some frozen" : ""})`;
  }).join("; ")}.` : "No job processes running.");
  parts.push(`Emergency lane: supervisor pid ${process.pid}, up ${mins(Math.round((Date.now() - START) / 1000))}.`);
  return { text: parts.join(" "), worker: { ...w, frozen: frozen(wp), alive_age: age }, bell: { ...b, up }, jobs: jobs.map(([dir, ps]) => ({ id: dir.split("/").pop(), procs: ps.length })) };
}

async function execute(c) {
  try {
    if (c.kind === "stop" || c.kind === "kill") return await stopJob(c.job_id, c.kind === "kill");
    if (c.kind === "restart") return await restart(c.arg?.what || "worker");
    if (c.kind === "status") return await status();
    const off = powerRefusal(CFG, { kind: c.kind });
    if (off) return { error: "power lanes off", text: off };
    if (c.kind === "shell") return await runShell(c.arg || {}, { secrets: [KEY, bellKey(), ...installSecrets(ROOT), ...envSecrets()], log, ...(SHELL_LOG ? { logFile: SHELL_LOG } : {}) });
    return { error: `unknown command ${c.kind}` };
  } catch (e) { return { error: String(e.message || e).slice(0, 300), text: `The emergency lane hit an error: ${String(e.message || e).slice(0, 200)}` }; }
}

// ---- Loop ----

const inFlight = new Set();
let lastStatus = 0, bellDownSince = null, lastStallTry = 0;

async function pushStalled(stalled) {
  if (!stalled?.length || !CFG.bell || Date.now() - lastStallTry < 60_000) return;
  lastStallTry = Date.now();
  const ack = [];
  for (const j of stalled) {
    const line = `Stalled: ${j.title}. No step in ${j.mins} min and {{ASSISTANT}}'s self-recovery hasn't fixed it. Say force kill it or restart the worker.`.replace(/\s+/g, " ").slice(0, 190);
    try { await ring({ id: j.id, title: j.title, status: "stalled", line, at: new Date().toISOString() }); ack.push(j.id); log(`stall push for ${j.id} (${j.mins} min)`); }
    catch (e) { log(`stall push for ${j.id} not sent (${e.message}); retrying in a minute`); break; }
  }
  if (ack.length) await api("control-done", { stall_ack: ack }).catch(() => {});
}

// The bell is its own launchd agent with KeepAlive; this covers what KeepAlive can't see (process up, port dead).
async function watchBell() {
  if (!BELL_HEALTH || SUP.bellHeal === false) return;
  if (await bellUp()) { bellDownSince = null; return; }
  bellDownSince ||= Date.now();
  if (Date.now() - bellDownSince < BELL_HEAL_MS) return;
  log(`bell has not answered for ${Math.round((Date.now() - bellDownSince) / 1000)} s; restarting it`);
  bellDownSince = Date.now(); // at most one try per BELL_HEAL_MS
  await restartBell();
}

// A worker that is up but whose loop stopped (frozen, hung) can't resume anything; restart it (its jobs are requeued).
let lastHealTry = 0, lastHealLoop = Date.now();
async function healWorker() {
  if (SUP.workerHeal === false) return;
  const now = Date.now(), gap = now - lastHealLoop;
  lastHealLoop = now;
  if (gap > 90_000) lastHealTry = now; // we were asleep too: give the worker a fresh window
  const age = aliveAge();
  if (age === null || age * 1000 < WORKER_HEAL_MS || now - lastHealTry < WORKER_HEAL_MS || now - START < WORKER_HEAL_MS) return;
  const a = await agent(WORKER_LABEL);
  if (!a.loaded || !a.pid) return; // launchd is restarting it already
  lastHealTry = now;
  log(`worker loop silent for ${mins(age)} (pid ${a.pid}); restarting it`);
  const r = await restartWorker();
  log(`worker self-heal: ${r.text}`);
}

async function main() {
  log(`supervisor up (pid ${process.pid}, worker ${WORKER_LABEL}, tag ${WORKER_TAG}) -> ${CFG.base}; watching jobs (silence ${WATCH.silenceMinutes} min, check-in ${WATCH.checkinMinutes} min, ${WATCH.maxRecoveries} recoveries${WATCH.timeScale > 1 ? `, clock x${WATCH.timeScale}` : ""})`);
  const watch = SUP.watchJobs === false ? null : makeWatcher({ jobsRoot: join(ROOT, "jobs"), workerTag: WORKER_TAG, cfg: WATCH, api, log });
  const sampleMs = Math.max(1000, WATCH.sampleSeconds * 1000 / Math.max(1, Number(WATCH.timeScale) || 1));
  let lastBell = 0, lastWatch = 0, busyUntil = Date.now() + BUSY_HOLD_MS;
  for (;;) {
    try {
      const report = Date.now() - lastStatus > 60_000;
      const body = { pid: process.pid };
      if (report) { lastStatus = Date.now(); body.status = (await status()).text; }
      const r = await api("control", body);
      if (r.busy || r.commands?.length) busyUntil = Date.now() + BUSY_HOLD_MS;
      for (const c of r.commands || []) {
        if (inFlight.has(c.id)) continue;
        inFlight.add(c.id);
        log(`command ${c.id}: ${c.kind}${c.job_id ? ` ${c.job_id}` : ""}${c.arg ? ` ${JSON.stringify(c.arg)}` : ""}`);
        // Not awaited: a 30-second stop or a long shell command never holds up a status or a kill behind it.
        execute(c).then(async (result) => {
          for (let i = 0; i < 5; i++) { try { await api("control-done", { id: c.id, result }); break; } catch { await sleep(2000); } }
        }).finally(() => inFlight.delete(c.id));
      }
      pushStalled(r.stalled).catch(() => {});
    } catch (e) { log("poll failed:", e.message); }
    if (Date.now() - lastBell > 30_000) { lastBell = Date.now(); watchBell().catch((e) => log("bell watch:", e.message)); }
    // Not awaited: a recovery's kill never holds up the command poll.
    if (watch && Date.now() - lastWatch >= sampleMs) { lastWatch = Date.now(); watch().catch((e) => log("watch:", e.message)); healWorker().catch((e) => log("worker heal:", e.message)); }
    await sleep(inFlight.size || Date.now() < busyUntil ? POLL_MS : IDLE_POLL_MS);
  }
}

for (const sig of ["SIGTERM", "SIGINT"]) process.on(sig, () => { log(`supervisor stopping (${sig})`); process.exit(0); });
main();
