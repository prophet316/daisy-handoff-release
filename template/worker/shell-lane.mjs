// {{ASSISTANT}} shell lane: run one shell command on the {{MACHINE}} from voice, the way Desktop Commander does in text chat.
// It runs inside the supervisor (worker/supervisor.mjs, its own launchd agent), so it works when the worker or the job
// queue is jammed. Each command gets its own process group, no stdin, a clean environment (no keys), a hard time limit
// (SIGTERM, then SIGKILL to the whole group), capped and redacted output, and one audit line in logs/shell.log.
// A short blocklist refuses what voice should never run however it is asked: root, disk wipes, keychain reads, macOS
// security settings, deleting a whole top-level folder, and killing the emergency lane itself.
//
// Usage: import { runShell } from "./shell-lane.mjs"     Self test: node worker/shell-lane.mjs --shell-selftest

import { spawn, execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, statSync, mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { homedir, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { makeRedactor } from "./redact.mjs";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const HOME = homedir();
const MAX_CMD = 4000;
const DEFAULT_TIMEOUT = 30, MAX_TIMEOUT = 300;
const HEAD = 4000, TAIL = 8000; // characters kept per stream: the start and the end
const PATH = ["/opt/homebrew/bin", "/opt/homebrew/sbin", "/usr/local/bin", join(HOME, "{{DOTDIR}}/node/bin"), "/usr/bin", "/bin", "/usr/sbin", "/sbin"].join(":");

// ---- What voice may not run ----

const BLOCK = [
  [/(^|[;&|(`]\s*|\bxargs\s+|\benv\s+|\/usr\/bin\/)(sudo|su|doas)\b/, "it needs root"],
  [/\bdiskutil\s+(erase\w*|zeroDisk|randomDisk|secureErase|partitionDisk|reformat|apfs\s+delete\w*)\b/i, "it erases or repartitions a disk"],
  [/(^|[;&|(\s])(mkfs\S*|newfs\S*)\b|\bdd\b[^\n]*\bof=\/dev\//, "it writes to a raw disk"],
  [/(^|[;&|(\s])(csrutil|nvram|fdesetup|spctl|tccutil|systemsetup)\b/, "it changes macOS security or system settings"],
  [/\bsecurity\s+(dump-keychain|find-(generic|internet)-password|export|unlock-keychain)\b/, "it reads saved passwords or keys"],
  [/\bkill\b[^\n]*\bpgrep\b[^\n]*(supervisor|{{SLUG}}|\bnode\b)/, "it would kill the emergency lane itself; say force kill the job, or restart the worker, instead"],
  [/launchctl\s+(bootout|unload|remove|disable|kill)\b[^\n]*com\.daisy\.supervisor/, "it would stop the emergency lane itself"],
];

const PROTECTED = new Set(["/", "/Users", HOME, "/System", "/Library", "/Applications", "/private", "/usr", "/bin", "/sbin", "/etc", "/var", "/opt", "/Volumes",
  ...["Library", "Documents", "Desktop", "Downloads", "Projects", "Pictures", "Movies", "Music", "{{DOTDIR}}", ".claude", ".ssh"].map((d) => join(HOME, d))]);

const segments = (cmd) => cmd.split(/[;&|\n]+/).map((s) => s.trim()).filter(Boolean);
const expand = (a) => {
  let p = a.replace(/^["']|["']$/g, "").replace(/^~(?=\/|$)/, HOME).replace(/^\$\{?HOME\}?(?=\/|$)/, HOME).replace(/\/+\*?$/, "");
  return p === "" ? "/" : p;
};

// rm -r (any spelling) aimed straight at /, the home folder or one of its main folders.
function rmProtected(cmd) {
  for (const seg of segments(cmd)) {
    const t = seg.split(/\s+/);
    const i = t.findIndex((w) => /^(\S*\/)?rm$/.test(w));
    if (i < 0) continue;
    const args = t.slice(i + 1);
    if (!args.some((a) => /^-[a-zA-Z]*[rR]/.test(a) || a === "--recursive")) continue;
    if (args.some((a) => !a.startsWith("-") && PROTECTED.has(expand(a)))) return true;
  }
  return false;
}

// pkill / killall aimed at the supervisor, everything {{ASSISTANT}}, or every node process (the supervisor is a node process).
function killsLane(cmd) {
  return segments(cmd).some((s) => /^(\S*\/)?(pkill|killall)\b/.test(s) && /(supervisor|{{SLUG}}|(^|\s)(-\w+\s+)*node(\s|$))/.test(s));
}

export function checkCommand(command) {
  const cmd = String(command ?? "").trim();
  if (!cmd) return "no command was given";
  if (cmd.length > MAX_CMD) return `the command is over ${MAX_CMD} characters`;
  for (const [re, why] of BLOCK) if (re.test(cmd)) return why;
  if (rmProtected(cmd)) return "it deletes a whole top-level folder";
  if (killsLane(cmd)) return "it would kill the emergency lane itself; say force kill the job, or restart the worker, instead";
  return null;
}

// ---- Running one command ----

// Keeps the start and the end of a stream; the middle of a huge output is cut and counted.
function collector() {
  let head = "", tail = "", total = 0;
  return {
    add(s) { total += s.length; if (head.length < HEAD) head += s.slice(0, HEAD - head.length); tail = (tail + s).slice(-TAIL); },
    get() {
      if (total <= TAIL) return { text: tail, cut: 0 };
      if (total <= HEAD + TAIL) return { text: head + tail.slice(HEAD + TAIL - total), cut: 0 };
      return { text: `${head}\n… [${total - HEAD - TAIL} characters cut] …\n${tail}`, cut: total - HEAD - TAIL };
    },
  };
}

const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };

function audit(logFile, line) {
  if (!logFile) return;
  try { mkdirSync(dirname(logFile), { recursive: true }); appendFileSync(logFile, JSON.stringify(line) + "\n"); } catch {}
}

// arg: { command, cwd?, timeout_seconds? }. Resolves to { ok, code, signal, timed_out, refused, secs, stdout, stderr, cut, text }.
export function runShell(arg = {}, { secrets = [], logFile = join(ROOT, "logs", "shell.log"), log = () => {} } = {}) {
  const t0 = Date.now();
  const command = String(arg.command ?? "").trim();
  const timeout = Math.min(Math.max(Number(arg.timeout_seconds) || DEFAULT_TIMEOUT, 1), MAX_TIMEOUT);
  const cwd = resolve(String(arg.cwd || HOME).replace(/^~(?=\/|$)/, HOME));
  const redact = makeRedactor(secrets);
  const shown = redact(command).slice(0, 500);
  const why = checkCommand(command) || (isDir(cwd) ? null : `the folder ${cwd} doesn't exist`);
  if (why) {
    audit(logFile, { at: new Date().toISOString(), command: shown, cwd, refused: why });
    log(`shell refused (${why}): ${shown}`);
    return Promise.resolve({ ok: false, refused: true, error: why, secs: 0, text: `Didn't run it: ${why}.` });
  }
  log(`shell run (limit ${timeout} s) in ${cwd}: ${shown}`);
  return new Promise((done) => {
    let child;
    try {
      child = spawn("/bin/zsh", ["-f", "-c", command], {
        cwd, detached: true, stdio: ["ignore", "pipe", "pipe"],
        env: { PATH, HOME, USER: process.env.USER || "{{USER}}", LOGNAME: process.env.USER || "{{USER}}", LANG: "en_US.UTF-8", TERM: "dumb", DAISY_SHELL: "1" },
      });
    } catch (e) {
      return done({ ok: false, error: e.message, secs: 0, text: `Couldn't start the shell: ${e.message}.` });
    }
    const out = collector(), err = collector();
    child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
    child.stdout.on("data", out.add); child.stderr.on("data", err.add);
    const group = (sig) => { try { process.kill(-child.pid, sig); } catch {} };
    let timedOut = false, exit = { code: null, signal: null }, finished = false, hard, linger;
    const timer = setTimeout(() => { timedOut = true; group("SIGTERM"); hard = setTimeout(() => group("SIGKILL"), 2000); }, timeout * 1000);
    const finish = (spawnError) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer); clearTimeout(linger);
      if (timedOut) { clearTimeout(hard); group("SIGKILL"); } // nothing it started outlives the time limit
      const o = out.get(), e = err.get();
      const secs = Number(((Date.now() - t0) / 1000).toFixed(1));
      const res = { ok: !timedOut && !spawnError && exit.code === 0, code: exit.code, signal: exit.signal, timed_out: timedOut, secs,
        stdout: redact(o.text), stderr: redact(e.text), cut: o.cut + e.cut };
      res.text = spawnError ? `Couldn't run it: ${spawnError}.`
        : timedOut ? `Stopped it at the ${timeout}-second limit (everything it started was killed).`
        : exit.code === 0 ? `Ran it: done in ${secs} s.`
        : `It ran but failed${exit.code !== null ? ` with exit code ${exit.code}` : ` (${exit.signal})`} after ${secs} s.`;
      audit(logFile, { at: new Date().toISOString(), command: shown, cwd, code: exit.code, signal: exit.signal, timed_out: timedOut, secs, out_chars: o.text.length + o.cut, err_chars: e.text.length + e.cut });
      log(`shell done: ${res.text}`);
      done(res);
    };
    child.on("error", (e) => finish(e.message));
    // The shell exited. Anything it put in the background on purpose (nohup, &) keeps running; give its output a moment, then report.
    child.on("exit", (code, signal) => { exit = { code, signal }; linger = setTimeout(() => { child.stdout.destroy(); child.stderr.destroy(); finish(); }, 1000); });
    child.on("close", (code, signal) => { if (exit.code === null && exit.signal === null) exit = { code, signal }; finish(); });
  });
}

// ---- Self test ----

if (process.argv.includes("--shell-selftest")) {
  const dir = mkdtempSync(join(tmpdir(), "daisy-shell-"));
  const logFile = join(dir, "shell.log");
  const SECRET = "local-test-secret-9f8e7d6c5b4a";
  process.env.DAISY_SELFTEST_SECRET_KEY = SECRET; // must never reach the command's environment
  let runs = 0;
  const run = (command, extra = {}) => { runs++; return runShell({ command, ...extra }, { secrets: [SECRET], logFile }); };
  const alive = (pat) => { try { return execFileSync("/usr/bin/pgrep", ["-f", pat]).toString().trim().length > 0; } catch { return false; } };
  let pass = 0, fail = 0;
  const check = (name, good, detail = "") => { good ? pass++ : fail++; console.log(`${good ? "PASS" : "FAIL"}  ${name}${good ? "" : `  -> ${detail}`}`); };

  let r = await run("echo hello");
  check("runs a command and returns its output", r.ok && r.stdout.trim() === "hello" && r.code === 0, JSON.stringify(r));
  r = await run("echo oops >&2; exit 3");
  check("reports the exit code and stderr", !r.ok && r.code === 3 && r.stderr.includes("oops") && /exit code 3/.test(r.text), JSON.stringify(r));
  r = await run("cat");
  check("no stdin: an interactive command ends at once", r.ok && r.secs < 3, JSON.stringify(r));
  r = await run("sleep 61 & sleep 62", { timeout_seconds: 2 });
  await new Promise((s) => setTimeout(s, 500));
  check("time limit kills the command and its children", r.timed_out && r.secs < 6 && !alive("sleep 61") && !alive("sleep 62"), `${JSON.stringify(r)} alive61=${alive("sleep 61")} alive62=${alive("sleep 62")}`);
  r = await run("trap '' TERM; sleep 63", { timeout_seconds: 2 });
  await new Promise((s) => setTimeout(s, 500));
  check("a command that ignores SIGTERM still dies (SIGKILL)", r.timed_out && r.secs < 7 && !alive("sleep 63"), `${JSON.stringify(r)} alive=${alive("sleep 63")}`);
  r = await run("nohup sleep 64 >/dev/null 2>&1 & echo started");
  const bg = alive("sleep 64");
  try { execFileSync("/usr/bin/pkill", ["-f", "sleep 64"]); } catch {}
  check("a job put in the background on purpose keeps running", r.ok && r.stdout.includes("started") && r.secs < 3 && bg, `${JSON.stringify(r)} bg=${bg}`);
  r = await run("yes x | head -n 200000");
  check("huge output is cut to its start and end", r.ok && r.cut > 0 && r.stdout.length < HEAD + TAIL + 100 && r.stdout.includes("characters cut"), `cut=${r.cut} len=${r.stdout.length}`);
  r = await run("printf 'é%.0s' {1..30000}");
  check("multi-byte text survives chunking", r.ok && !r.stdout.includes("\uFFFD") && r.stdout.includes("é"), r.stdout.slice(0, 80));
  r = await run(`echo sk-ant-api03-abcdefghijklmnopqrstuvwx; echo ${SECRET}`);
  check("secrets in the output are redacted", r.ok && !r.stdout.includes("abcdefghijklmnop") && !r.stdout.includes(SECRET), r.stdout);
  r = await run("env");
  check("clean environment: no keys from the supervisor", r.ok && !r.stdout.includes("DAISY_SELFTEST_SECRET_KEY") && r.stdout.includes("DAISY_SHELL=1"), r.stdout);
  // The lane finds node through {{ASSISTANT}}'s node link (or Homebrew). A practice install with --home elsewhere makes the link
  // there, not in this home, so with no link here only the PATH is checked (nvm, Volta or a tarball Node isn't on the lane's PATH).
  const linked = existsSync(join(HOME, "{{DOTDIR}}/node/bin/node"));
  r = await run("echo $PATH; command -v node || echo NO_NODE");
  const pathOk = r.stdout.includes("/opt/homebrew/bin") && r.stdout.includes("{{DOTDIR}}/node/bin");
  check(linked ? "PATH has Homebrew and {{ASSISTANT}}'s node, and node is found" : "PATH has Homebrew and {{ASSISTANT}}'s node folder (no node link in this home, so finding node isn't checked)",
    r.ok && pathOk && (!linked || /\n\/\S*\/node\s*$/.test(r.stdout)), r.stdout);
  r = await run("pwd", { cwd: "~/Projects" });
  check("cwd with ~ works", r.ok && r.stdout.trim() === join(HOME, "Projects"), r.stdout);
  r = await run("pwd", { cwd: "/no/such/folder" });
  check("a missing folder is refused", r.refused && /doesn't exist/.test(r.error), JSON.stringify(r));

  const refused = ["sudo ls", "echo hi && sudo rm x", "ls | xargs sudo rm", "/usr/bin/sudo -s", "su root", "rm -rf ~", "rm -rf /", "rm -fr \"$HOME\"", "rm -r -f ~/Projects/",
    "rm -rf /*", "cd /tmp; rm -Rf ~/Documents", "diskutil eraseDisk APFS X disk4", "dd if=/dev/zero of=/dev/disk4", "security find-generic-password -w -s foo",
    "security dump-keychain", "csrutil disable", "sudo nvram boot-args=x", "tccutil reset All", "pkill -f {{SLUG}}", "killall node", "pkill -9 node",
    "pkill -f supervisor.mjs", "kill -9 $(pgrep -f supervisor)", "launchctl bootout gui/501/com.daisy.supervisor"];
  // Checked with the filter only, never run: a blocklist bug must not be able to execute rm -rf ~ in a test.
  for (const c of refused) { const why = checkCommand(c); check(`refused: ${c}`, typeof why === "string", `allowed`); }
  check("killing {{ASSISTANT}} points to force kill instead", /force kill/.test(checkCommand("pkill -f {{SLUG}}/jobs/1234abcd") || ""), checkCommand("pkill -f {{SLUG}}/jobs/1234abcd"));
  r = await run("sudo -n true");
  check("a refused command is not run and says why", r.refused === true && r.code === undefined && /root/.test(r.text), JSON.stringify(r));

  mkdirSync(join(dir, "victim", "sub"), { recursive: true });
  const allowed = [`rm -rf ${join(dir, "victim")}`, "ls ~/Projects >/dev/null", "ps aux | grep -c node", "grep -c sudo /etc/sudoers 2>/dev/null; true",
    "echo pseudo summary", "git -C ~/Projects/{{SLUG}} log --oneline -1 2>/dev/null; true", "launchctl print gui/$(id -u)/com.daisy.handoff-worker >/dev/null; true", "pgrep -fl supervisor; true"];
  for (const c of allowed) { r = await run(c); check(`allowed: ${c}`, r.ok && !r.refused, JSON.stringify(r)); }
  check("rm -rf on a test folder really removed it", !isDir(join(dir, "victim")));

  const lines = readFileSync(logFile, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const leaked = lines.some((l) => JSON.stringify(l).includes(SECRET) || JSON.stringify(l).includes("abcdefghijklmnop"));
  check("every command has an audit line, with no output and no secrets", lines.length === runs && !leaked && lines.every((l) => !("stdout" in l)), `lines=${lines.length} leaked=${leaked}`);

  rmSync(dir, { recursive: true, force: true });
  console.log(`${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
}
