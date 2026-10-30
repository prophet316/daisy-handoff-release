// The supervisor's poll speed: idle it polls slowly, and a stop, a force kill or a job process still alive on this computer
// puts it back on the fast poll, so a force kill for a job the connector already shows as stopped isn't slowed.
// Runs the real supervisor (worker/supervisor.mjs) against the real connector code (src/index.js) on 127.0.0.1, with a local
// SQLite copy of the tables and short test timings (fast 0.25 s, idle 2 s), plus the connector's check-in rule for run_command. Nothing deployed, no launch agent; about 25 s.
// Usage: node test/poll.mjs   (run by ./test.sh gate)
import { readFileSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { timingSafeEqual } from "node:crypto";
process.removeAllListeners("warning"); // the SQLite stand-in is all this test uses it for
import { DatabaseSync } from "node:sqlite";

crypto.subtle.timingSafeEqual ??= (a, b) => timingSafeEqual(a, b);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const connector = (await import("../src/index.js")).default;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  poll: ${name}${ok || !extra ? "" : `  (${String(extra).slice(0, 300)})`}`); ok ? pass++ : fail++; };

const db = new DatabaseSync(":memory:");
db.exec(readFileSync(join(ROOT, "schema.sql"), "utf8"));
const stmt = (sql, binds = []) => ({
  bind: (...b) => stmt(sql, b),
  run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...binds).changes) } }),
  first: async () => db.prepare(sql).get(...binds) ?? null,
  all: async () => ({ results: db.prepare(sql).all(...binds) }),
});
const KEY = "poll-test-worker-key";
const env = { CONNECTOR_KEY: "poll-test-connector-key", WORKER_KEY: KEY, POWER_LANES: "on",
  DB: { prepare: (sql) => stmt(sql), batch: async (l) => { const o = []; for (const s of l) o.push(await s.run()); return o; } } };

const polls = [];
const srv = createServer(async (req, res) => {
  let body = ""; for await (const c of req) body += c;
  if (req.url === "/api/control") polls.push(Date.now());
  const r = await connector.fetch(new Request(`http://127.0.0.1${req.url}`, { method: req.method, headers: req.headers, body: req.method === "POST" ? body : undefined }), env);
  res.writeHead(r.status, { "Content-Type": "application/json" }); res.end(await r.text());
});
await new Promise((r) => srv.listen(0, "127.0.0.1", r));

// The connector rewrites the supervisor's check-in once it's 10 s old, so with the real 15 s idle poll run_command (which
// refuses when the check-in is over 30 s old) is never refused on a working Mac. Connector only; the supervisor isn't up yet.
const iso = (agoMs = 0) => new Date(Date.now() - agoMs).toISOString();
const setCheckin = (ago) => db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('supervisor', ?1, ?2) ON CONFLICT(key) DO UPDATE SET value=?1")
  .run(JSON.stringify({ at: iso(ago), pid: 1, status: null }), iso(ago));
setCheckin(11_000);
await connector.fetch(new Request("https://test.invalid/api/control", { method: "POST", headers: { Authorization: `Bearer ${KEY}` }, body: "{}" }), env);
const at = JSON.parse(db.prepare("SELECT value FROM settings WHERE key='supervisor'").get().value).at;
check("a poll rewrites a check-in that's 11 s old (the idle poll is 15 s)", Date.now() - Date.parse(at) < 2000, at);
setCheckin(29_000);
const pending = connector.fetch(new Request(`https://test.invalid/${env.CONNECTOR_KEY}/mcp`, { method: "POST", headers: { "Content-Type": "application/json", "CF-Connecting-IP": "160.79.104.20" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "run_command", arguments: { command: "echo hi" } } }) }), env);
await sleep(300);
db.prepare("UPDATE control SET taken_at=?1, done_at=?1, result='{\"text\":\"ok\"}' WHERE kind='shell'").run(iso());
const shellText = (await (await pending).json()).result.content[0].text;
check("run_command is queued while the check-in is under 30 s old", !/Not run/.test(shellText) && db.prepare("SELECT count(*) AS n FROM control WHERE kind='shell'").get().n === 1, shellText);
setCheckin(31_000);
const late = (await (await connector.fetch(new Request(`https://test.invalid/${env.CONNECTOR_KEY}/mcp`, { method: "POST", headers: { "Content-Type": "application/json", "CF-Connecting-IP": "160.79.104.20" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "run_command", arguments: { command: "echo hi" } } }) }), env)).json()).result.content[0].text;
check("and refused, with nothing queued, once it's over 30 s old", /<job-output>\nNot run/.test(late) && db.prepare("SELECT count(*) AS n FROM control WHERE kind='shell'").get().n === 1, late);
db.prepare("DELETE FROM settings WHERE key='supervisor'").run(); db.prepare("DELETE FROM control").run();

const tag = "polltest", keyFile = `logs/.${tag}-key`, cfg = join(ROOT, "logs", `${tag}-config.json`);
mkdirSync(join(ROOT, "logs"), { recursive: true });
writeFileSync(join(ROOT, keyFile), KEY, { mode: 0o600 });
writeFileSync(cfg, JSON.stringify({ base: `http://127.0.0.1:${srv.address().port}`, keyFile, workerTag: tag, aliveFile: `logs/.${tag}-alive`, powerLanes: false,
  supervisor: { pollSeconds: 0.25, idlePollSeconds: 2, busyHoldSeconds: 0.5, watchJobs: false, bellHeal: false, workerHeal: false,
    workerLabel: "com.daisy.polltest-none", bellLabel: "com.daisy.polltest-none-bell", shellLog: `logs/${tag}-shell.log` } }));
const sup = spawn(process.execPath, [join(ROOT, "worker", "supervisor.mjs"), "--config", cfg], { stdio: ["ignore", "pipe", "pipe"] });
let out = ""; sup.stdout.on("data", (d) => (out += d)); sup.stderr.on("data", (d) => (out += d));
const jobId = "feedf00d", jobDir = join(ROOT, "jobs", jobId);
let leftover = null;
const pollsIn = async (ms) => { const n = polls.length; await sleep(ms); return polls.length - n; };

try {
  await sleep(1500); // past the start-up fast window (0.5 s here)
  let n = await pollsIn(4000);
  check("idle (nothing running, no stop asked for), it polls slowly", n >= 1 && n <= 3, `${n} polls in 4 s`);

  // A stop asked for a minute ago; the connector already shows the job as cancelled (a stop that wasn't confirmed).
  db.prepare("INSERT INTO jobs (id, title, details, status, cancel_requested, cancel_at, created_at, updated_at) VALUES (?, 'stuck', 'x', 'cancelled', 1, ?, ?, ?)").run(jobId, iso(60_000), iso(120_000), iso(60_000));
  await pollsIn(2500); // the next slow poll hears about it
  n = await pollsIn(2000);
  check("after a stop request, it switches to the fast poll", n >= 5, `${n} polls in 2 s`);
  db.prepare("INSERT INTO control (kind, job_id, created_at) VALUES ('kill', ?, ?)").run(jobId, iso());
  const asked = Date.now();
  for (let i = 0; i < 40 && !db.prepare("SELECT taken_at FROM control WHERE kind='kill'").get()?.taken_at; i++) await sleep(50);
  check("a force kill after that stop is picked up within a second", Date.now() - asked < 1000, `${Date.now() - asked} ms`);

  // The stop and the kill are long past, but the job's processes are still alive on this computer.
  db.prepare("UPDATE jobs SET cancel_at=?").run(iso(20 * 60_000));
  db.prepare("UPDATE control SET created_at=?, taken_at=?, done_at=?").run(iso(20 * 60_000), iso(20 * 60_000), iso(20 * 60_000));
  await pollsIn(2500);
  n = await pollsIn(4000);
  check("with the stop long past and no job processes here, it's back to the slow poll", n >= 1 && n <= 3, `${n} polls in 4 s`);
  mkdirSync(jobDir, { recursive: true });
  leftover = spawn(process.execPath, ["-e", "setTimeout(() => {}, 60000)"], { detached: true, stdio: "ignore", env: { ...process.env, DAISY_JOB_DIR: jobDir, DAISY_WORKER_TAG: tag } });
  await pollsIn(2500);
  n = await pollsIn(2000);
  check("a job process still alive here keeps it on the fast poll", n >= 5, `${n} polls in 2 s`);
  db.prepare("INSERT INTO control (kind, job_id, created_at) VALUES ('kill', ?, ?)").run(jobId, iso());
  const killAt = Date.now();
  let dead = false;
  for (let i = 0; i < 30 && !dead; i++) { await sleep(50); try { process.kill(leftover.pid, 0); } catch { dead = true; } if (leftover.exitCode !== null || leftover.signalCode) dead = true; }
  check("so a force kill of a job the connector already wrote off ends its process within 1.5 seconds (the idle poll here is 2)", dead, `${Date.now() - killAt} ms; supervisor log: ${out.slice(-300)}`);
} finally {
  sup.kill("SIGTERM");
  try { process.kill(-leftover?.pid, "SIGKILL"); } catch {}
  srv.close();
  for (const f of [keyFile, `logs/.${tag}-alive`, `logs/${tag}-shell.log`]) rmSync(join(ROOT, f), { force: true });
  rmSync(cfg, { force: true });
  rmSync(jobDir, { recursive: true, force: true });
}
console.log(`supervisor poll: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
