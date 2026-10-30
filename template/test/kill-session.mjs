// Stop and force kill find a job's processes by session without Python: a process that cleared its environment (no tags) and
// whose parent is gone (not in the process tree) is still found through the session the worker recorded, or through a session
// one of the job's processes leads (Claude Code's Bash shell), and killed.
// Usage: node test/kill-session.mjs   (run by ./test.sh gate; macOS)
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { processTable, findProcs, hardKill } from "../worker/kill.mjs";

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
writeFileSync(join(jobDir, ".run.json"), JSON.stringify({ pid: sh.pid, sid: sh.pid, worker_tag: "kill-test" }));
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
writeFileSync(join(jobDir, ".run.json"), JSON.stringify({ pid: root.pid, sid: root.pid, worker_tag: "kill-test" }));
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

console.log(`kill: ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
