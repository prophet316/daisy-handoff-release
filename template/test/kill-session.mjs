// Stop and force kill find a job's processes by session without Python: a process that cleared its environment (no tags) and
// whose parent is gone (not in the process tree) is still found through the session the worker recorded, or through a session
// one of the job's processes leads (Claude Code's Bash shell), and killed. A stale record whose session id now belongs to
// something else (a reboot, a reused pid) is ignored.
// Usage: node test/kill-session.mjs   (run by ./test.sh gate; macOS)
import { spawn } from "node:child_process";
import http from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { processTable, findProcs, hardKill, bootTime } from "../worker/kill.mjs";

let pass = 0, fail = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  kill: ${name}${ok || !extra ? "" : `  (${String(extra).slice(0, 300)})`}`); ok ? pass++ : fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "worker", "kill.mjs"), "utf8");
check("kill.mjs never runs Python (it needs Apple's Command Line Tools)", !/python/i.test(src.replace(/^\s*\/\/.*$/gm, "")));

if (process.platform !== "darwin") { console.log(`kill: ${pass}/${pass + fail} passed (session checks are macOS only)`); process.exit(fail ? 1 : 0); }

// A job's session: a shell that starts an untagged sleep (env -i clears every tag) and prints its pid, then is killed itself,
// so the sleep's parent is launchd and only the session ties it to the job.
const jobDir = mkdtempSync(join(tmpdir(), "kill-session-"));
const sh = spawn("/bin/sh", ["-c", "env -i /bin/sleep 120 & echo $!; wait"], { detached: true, stdio: ["ignore", "pipe", "ignore"] });
const orphan = await new Promise((res) => sh.stdout.once("data", (d) => res(Number(String(d).trim()))));
// What the worker records when it starts a run (worker.mjs): the session, when the run started, this boot, its runaway cap.
const runRec = (pid, over = {}) => JSON.stringify({ pid, sid: pid, worker_tag: "kill-test", at: new Date().toISOString(), boot: bootTime(),
  until: new Date(Date.now() + 3600_000).toISOString(), ...over });
check("bootTime reads when this Mac started", Number.isInteger(bootTime()) && bootTime() * 1000 < Date.now(), bootTime());
writeFileSync(join(jobDir, ".run.json"), runRec(sh.pid));
const t0 = processTable();
check("processTable reads real session ids (a detached shell leads its own session)", t0.find((p) => p.pid === sh.pid)?.sid === sh.pid, JSON.stringify(t0.find((p) => p.pid === sh.pid)));
check("the untagged sleep is in the shell's session", t0.find((p) => p.pid === orphan)?.sid === sh.pid, JSON.stringify(t0.find((p) => p.pid === orphan)));
process.kill(sh.pid, "SIGKILL");
await sleep(300);
const t1 = processTable(), o = t1.find((p) => p.pid === orphan);
check("the sleep outlived its shell and has no tag and no job parent", !!o && o.ppid === 1 && !/DAISY_/.test(o.text), JSON.stringify(o));
check("findProcs finds it through the recorded session", findProcs({ jobDir }, t1).some((p) => p.pid === orphan));
check("findProcs never returns this test's own process", !findProcs({ jobDir }, t1).some((p) => p.pid === process.pid));
const r = await hardKill({ jobDir }, { graceMs: 3000 });
await sleep(200);
check("hardKill stops it", r.found >= 1 && !alive(orphan), JSON.stringify(r));
if (alive(orphan)) try { process.kill(orphan, "SIGKILL"); } catch {}

// Force kill, the way Claude Code runs a Bash command: the job's process starts a shell that leads its own session, and the
// command double-forks an untagged sleep, so the sleep's parent is launchd and its session is the shell's, not the job's.
const pidFile = join(jobDir, "orphan.pid");
const script = `( env -i /bin/sleep 120 & echo $! > '${pidFile}' ); exec /bin/sleep 120`;
const root = spawn(process.execPath, ["-e", `require("child_process").spawn("/bin/sh", ["-c", ${JSON.stringify(script)}], { detached: true, stdio: "ignore" }); setInterval(() => {}, 1e9);`],
  { detached: true, stdio: "ignore" });
writeFileSync(join(jobDir, ".run.json"), runRec(root.pid));
let forked = 0;
for (let i = 0; i < 50 && !forked; i++) { await sleep(100); try { forked = Number(readFileSync(pidFile, "utf8").trim()); } catch {} }
await sleep(200);
const t2 = processTable(), f = t2.find((p) => p.pid === forked), shell = t2.find((p) => p.ppid === root.pid);
check("the double-forked sleep sits in the Bash shell's own session, with no job parent", !!f && !!shell && f.ppid === 1 && shell.sid === shell.pid && f.sid === shell.pid && f.sid !== root.pid, JSON.stringify({ f, shell }));
check("findProcs finds it through the session the job's shell leads", findProcs({ jobDir }, t2).some((p) => p.pid === forked));
const r2 = await hardKill({ jobDir }, { graceMs: 0 });
await sleep(300);
check("force kill (no grace) stops it along with the job", !alive(forked) && !alive(root.pid), JSON.stringify(r2));
for (const pid of [forked, root.pid, shell?.pid]) if (pid && alive(pid)) try { process.kill(pid, "SIGKILL"); } catch {}
rmSync(jobDir, { recursive: true, force: true });

// A reused session id: after a reboot (or once a job's processes are all gone) the number in .run.json can belong to an
// unrelated program. Two stand-ins that have nothing to do with any job and carry no tag: a program leading its own
// session, and a program whose session leader is gone. Each stale record names their session; the worker's startup
// cleanup (every job of a worker tag) and a single job's stop must find nothing, and both programs must still be running.
const jobsRoot = mkdtempSync(join(tmpdir(), "kill-reused-"));
const other = spawn("/usr/bin/env", ["-i", "/bin/sleep", "120"], { detached: true, stdio: "ignore" });
const sh2 = spawn("/bin/sh", ["-c", "env -i /bin/sleep 120 & echo $!; wait"], { detached: true, stdio: ["ignore", "pipe", "ignore"] });
const lone = await new Promise((res) => sh2.stdout.once("data", (d) => res(Number(String(d).trim()))));
process.kill(sh2.pid, "SIGKILL");
await sleep(300);
const hour = 3600_000, ago = (ms) => new Date(Date.now() - ms).toISOString();
const stale = {
  "a run from before a reboot (another boot time)": [other.pid, { boot: bootTime() - 86400 }],
  "a run recorded before this change (no boot time)": [other.pid, { boot: undefined }],
  "a run that started an hour before the program now leading that session": [other.pid, { at: ago(hour) }],
  "a leaderless session from before a reboot": [sh2.pid, { boot: bootTime() - 86400 }],
  "a leaderless session whose program started after the run's runaway cap": [sh2.pid, { at: ago(3 * hour), until: ago(2 * hour) }],
  "a leaderless session whose program started before the run did": [sh2.pid, { at: new Date(Date.now() + 60_000).toISOString() }],
};
let i = 0;
for (const [name, [sid, over]] of Object.entries(stale)) {
  const dir = join(jobsRoot, `job${i++}`);
  mkdirSync(dir);
  writeFileSync(join(dir, ".run.json"), runRec(sid, over));
  const found = findProcs({ jobDir: dir }).map((p) => p.pid);
  check(`a stale record is ignored: ${name}`, !found.includes(other.pid) && !found.includes(lone), JSON.stringify(found));
}
const t3 = processTable();
check("the stand-ins really are in the sessions the records name", t3.find((p) => p.pid === other.pid)?.sid === other.pid && t3.find((p) => p.pid === lone)?.sid === sh2.pid,
  JSON.stringify([t3.find((p) => p.pid === other.pid), t3.find((p) => p.pid === lone)]));
const r3 = await hardKill({ workerTag: "kill-test", jobsRoot }, { graceMs: 1000 });
await sleep(300);
check("startup cleanup over every stale record finds and signals nothing", r3.found === 0 && alive(other.pid) && alive(lone), JSON.stringify(r3));
// The same session recorded by a matching run is still trusted (the leaderless one, recorded with this boot and a start before it).
const live = join(jobsRoot, "live");
mkdirSync(live);
writeFileSync(join(live, ".run.json"), runRec(sh2.pid, { at: ago(5000) }));
check("a matching record still finds the leaderless session", findProcs({ jobDir: live }).some((p) => p.pid === lone));

// The worker itself, starting up (its orphan cleanup) with stale records in its job folders: the unrelated programs keep
// running, its own records with nothing left running are deleted, and another worker's record is left alone.
{
  const ROOT = join(dirname(fileURLToPath(import.meta.url)), ".."), tag = `kill-test-${process.pid}`, jobs = join(ROOT, "jobs");
  const ids = [`kt-${process.pid}-a`, `kt-${process.pid}-b`, `kt-${process.pid}-c`];
  mkdirSync(join(ROOT, "logs"), { recursive: true });
  ids.forEach((id) => mkdirSync(join(jobs, id), { recursive: true }));
  writeFileSync(join(jobs, ids[0], ".run.json"), runRec(other.pid, { worker_tag: tag, boot: bootTime() - 86400 }));
  writeFileSync(join(jobs, ids[1], ".run.json"), runRec(sh2.pid, { worker_tag: tag, at: ago(3 * hour), until: ago(2 * hour) }));
  writeFileSync(join(jobs, ids[2], ".run.json"), runRec(other.pid, { worker_tag: "someone-else", boot: bootTime() - 86400 }));
  const srv = http.createServer((req, res) => { req.resume(); req.on("end", () => res.end(req.url.endsWith("/claim") ? '{"job":null}' : req.url.endsWith("/reset") ? '{"requeued":0}' : "{}")); });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const cfgDir = mkdtempSync(join(tmpdir(), "kill-worker-")), cfg = join(cfgDir, "config.json");
  writeFileSync(join(ROOT, "logs", `.${tag}-key`), "testkey");
  writeFileSync(cfg, JSON.stringify({ base: `http://127.0.0.1:${srv.address().port}`, workerTag: tag, keyFile: `logs/.${tag}-key`, aliveFile: `logs/.${tag}-alive`,
    logFile: `logs/${tag}.log`, pollSeconds: 1, maxParallel: 1, claudeBin: "/usr/bin/false", powerLanes: false }));
  const w = await new Promise((resolve) => {
    const c = spawn(process.execPath, [join(ROOT, "worker", "worker.mjs"), "--once", "--config", cfg], { stdio: ["ignore", "ignore", "pipe"] });
    let err = ""; c.stderr.on("data", (d) => (err += d));
    const t = setTimeout(() => c.kill("SIGKILL"), 60_000);
    c.on("close", (code) => { clearTimeout(t); resolve({ code, err }); });
  });
  srv.close();
  const has = (id) => existsSync(join(jobs, id, ".run.json"));
  check("a worker starting up leaves the unrelated programs running", w.code === 0 && alive(other.pid) && alive(lone), `${w.code} ${w.err.slice(-300)}`);
  check("it deletes its own stale run records and leaves another worker's", !has(ids[0]) && !has(ids[1]) && has(ids[2]), JSON.stringify(ids.map(has)));
  ids.forEach((id) => rmSync(join(jobs, id), { recursive: true, force: true }));
  for (const f of [`.${tag}-key`, `.${tag}-alive`, `${tag}.log`]) rmSync(join(ROOT, "logs", f), { force: true });
  rmSync(cfgDir, { recursive: true, force: true });
}
for (const pid of [other.pid, lone]) if (alive(pid)) try { process.kill(pid, "SIGKILL"); } catch {}
rmSync(jobsRoot, { recursive: true, force: true });

console.log(`kill: ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
