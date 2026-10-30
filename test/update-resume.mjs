// An update that stops partway (here: where the Cloudflare sign-in or deploy would fail) must not change your answers on the
// next try: the command line stays off, the lead agent stays, the connector URL stays. Offline: dry runs in a throwaway home.
// Usage: node test/update-resume.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const home = fs.mkdtempSync(path.join(os.tmpdir(), "update-resume-"));
const dir = path.join(home, "Projects", "daisy-handoff");
let fail = 0;
const check = (ok, s, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${s}${ok || !extra ? "" : `  (${extra})`}`); if (!ok) fail++; };
const install = (args, opts = {}) => spawnSync(process.execPath, [...(opts.pre || []), path.join(REPO, "install.mjs"), ...args, "--home", home], { encoding: "utf8" });
const json = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));

// Stops the installer just before the worker config gets the connector's address, as a failed deploy does.
const hook = path.join(home, "stop-at-deploy.mjs");
fs.writeFileSync(hook, `import fs from "node:fs"; import { syncBuiltinESMExports } from "node:module";
const orig = fs.writeFileSync;
fs.writeFileSync = function (p, data, ...rest) {
  if (String(p).endsWith("config.json") && /workers\\.dev/.test(String(data))) { console.error("TEST: stopped at the deploy step"); process.exit(1); }
  return orig.call(this, p, data, ...rest);
};
syncBuiltinESMExports();\n`);

let r = install(["--dry-run", "--yes", "--no-power-lanes", "--lead-agent", "captain", "--name", "Tester", "--assistant", "Daisy"]);
check(r.status === 0, "practice install with the command line off and a lead agent");
const url = fs.readFileSync(path.join(dir, ".connector-url"), "utf8");

r = install(["--dry-run", "--update"], { pre: ["--import", pathToFileURL(hook).href] });
check(r.status !== 0 && /stopped at the deploy step/.test(r.stderr), "the update stops at the deploy step");
const early = json("install-receipt.json");
check(early.unfinished === true && early.powerLanes === false && early.leadAgent === "captain", "the stopped update already wrote its answers, marked unfinished");
check(fs.existsSync(path.join(dir, ".connector-url")), "the stopped update kept the connector URL in the new folder");
const rk = install(["--dry-run", "--rotate-keys"]);
check(rk.status !== 0 && /stopped partway/.test(rk.stderr) && !/ENOENT|\n\s+at /.test(rk.stderr), "--rotate-keys on the half-built install explains, no crash");

r = install(["--dry-run", "--update"]);
check(r.status === 0, "the second try finishes");
const done = json("install-receipt.json");
check(done.powerLanes === false && json(path.join("worker", "config.json")).powerLanes === false, "the command line and desktop control are still off");
check(done.leadAgent === "captain" && /^LEAD_AGENT = "captain"$/m.test(fs.readFileSync(path.join(dir, "wrangler.toml"), "utf8")), "the lead agent is kept");
check(!done.unfinished, "the finished receipt replaces the unfinished one");
check(fs.readFileSync(path.join(dir, ".connector-url"), "utf8") === url && /connector URL is the same/.test(r.stdout), "the connector URL is the same, and it says so");

// The lead agent can be turned off on an update, and the connector URL stays.
r = install(["--dry-run", "--update", "--lead-agent", "x", "--no-lead-agent"]);
check(r.status !== 0 && /not both/.test(r.stderr), "--lead-agent and --no-lead-agent together are refused");
r = install(["--dry-run", "--update", "--no-lead-agent"]);
const off = json("install-receipt.json");
check(r.status === 0 && off.leadAgent === null && /^LEAD_AGENT = ""$/m.test(fs.readFileSync(path.join(dir, "wrangler.toml"), "utf8")), "--update --no-lead-agent turns the lead agent off");
check(!fs.existsSync(path.join(dir, ".lead-agent-key")) && /Lead agent "captain" turned off/.test(r.stdout), "its key file isn't carried over, and it says so");
check(fs.readFileSync(path.join(dir, ".connector-url"), "utf8") === url, "the connector URL stays the same");
r = install(["--dry-run", "--update"]);
check(r.status === 0 && json("install-receipt.json").leadAgent === null, "the next update keeps it off");

// The phone bell is off unless you say yes (Mac only): --yes leaves it off, an update never turns it on by itself, and it can
// be turned on and off again and stays as you left it.
if (process.platform === "darwin") {
  const plist = path.join(home, "Library", "LaunchAgents", "com.daisy.jarvis-bell.plist");
  check(json("install-receipt.json").bell === false && json(path.join("worker", "config.json")).bell === null && !fs.existsSync(plist), "an install with --yes leaves the bell off");
  r = install(["--dry-run", "--update"]);
  check(r.status === 0 && json("install-receipt.json").bell === false && !fs.existsSync(plist), "an update keeps it off");
  r = install(["--dry-run", "--update", "--bell"]);
  check(r.status === 0 && json("install-receipt.json").bell === true && json(path.join("worker", "config.json")).bell?.url && fs.existsSync(plist), "--update --bell turns it on");
  check(/I am using this for local development/.test(r.stdout) && /--no-bell/.test(r.stdout), "the installer says what the bell answers for you, and how to turn it off");
  r = install(["--dry-run", "--update"]);
  check(r.status === 0 && json("install-receipt.json").bell === true && fs.existsSync(plist), "the next update keeps it on, as you chose");
  r = install(["--dry-run", "--update", "--no-bell"]);
  check(r.status === 0 && json("install-receipt.json").bell === false && json(path.join("worker", "config.json")).bell === null && !fs.existsSync(plist), "--update --no-bell turns the bell off and moves its launch agent aside", r.stderr.slice(-200));
  check(!/local development/.test(r.stdout), "with the bell off, the installer has no development-channel note to show");
  // An install from before the question (no answer on record, bell running): the update asks instead of keeping it on.
  r = install(["--dry-run", "--update", "--bell"]);
  const rec = json("install-receipt.json"); delete rec.bell; fs.writeFileSync(path.join(dir, "install-receipt.json"), JSON.stringify(rec));
  r = install(["--dry-run", "--update"]);
  check(r.status !== 0 && /no terminal to ask in \("Turn on phone notifications\?"\)/.test(r.stderr) && fs.existsSync(plist), "with no answer on record and no terminal, the update stops at the question and changes nothing", r.stderr.slice(-300));
  check(/an update keeps your earlier answers/.test(r.stderr) && !/command line and desktop control on/.test(r.stderr), "the update's no-terminal stop names an update's defaults, not a new install's", r.stderr.slice(-300));
  r = install(["--dry-run", "--update", "--yes"]);
  check(r.status === 0 && json("install-receipt.json").bell === false && !fs.existsSync(plist), "with --yes it takes the default, off, and stops the old bell");
  check(/research preview/.test(r.stdout) && /I am using this for local development/.test(r.stdout) && /\[no\]: no \(--yes\)/.test(r.stdout), "the question says what the bell answers for you, and shows the answer --yes took");
  // A new install: no terminal and no --yes stops at the first question; in a terminal a bare Enter means no, yes means yes.
  const nh = path.join(home, "new-bell");
  const fresh = (args, o = {}) => spawnSync(o.cmd || process.execPath, [...(o.pre || []), path.join(REPO, "install.mjs"), "--dry-run", "--name", "Tester", "--assistant", "Daisy", "--home", nh, ...args], { encoding: "utf8", input: o.input });
  r = fresh([]);
  check(r.status !== 0 && /no terminal to ask in/.test(r.stderr) && !fs.existsSync(path.join(nh, "Projects")), "no terminal and no --yes: it stops before answering anything");
  for (const pair of [["--bell", "--no-bell"], ["--lead-agent", "x", "--no-lead-agent"], ["--power-lanes", "--no-power-lanes"]]) {
    r = fresh(pair);
    check(r.status !== 0 && /not both/.test(r.stderr) && !/no terminal/.test(r.stderr), `${pair.filter((a) => a.startsWith("--")).join(" with ")} is refused before any question`, r.stderr.slice(-200));
  }
  // A real terminal (Python's pty module), answering each question as it shows: Enter, or `bell` at the bell question.
  const PTY = `import os, pty, sys, select
pid, fd = pty.fork()
if pid == 0: os.execv(sys.argv[1], sys.argv[1:])
out, asked = b"", 0
while True:
    r, _, _ = select.select([fd], [], [], 60)
    if not r: break
    try: d = os.read(fd, 4096)
    except OSError: break
    if not d: break
    out += d
    while out.count(b"]: ") > asked:
        asked += 1
        bell = b"turn it on [no" in out[:[i for i in range(len(out)) if out.startswith(b"]: ", i)][asked - 1]][-20:]
        os.write(fd, (os.environ["BELL_ANSWER"] if bell else "").encode() + b"\\r")
sys.stdout.write(out.decode("utf8", "replace"))
sys.exit(os.WEXITSTATUS(os.waitpid(pid, 0)[1]))`;
  const tty = async (bell) => {
    fs.rmSync(nh, { recursive: true, force: true });
    return spawnSync("python3", ["-c", PTY, process.execPath, path.join(REPO, "install.mjs"), "--dry-run", "--name", "Tester", "--assistant", "Daisy", "--machine", "Mac", "--home", nh],
      { encoding: "utf8", env: { ...process.env, BELL_ANSWER: bell }, timeout: 120_000 });
  };
  const nrec = () => { try { return JSON.parse(fs.readFileSync(path.join(nh, "Projects", "daisy-handoff", "install-receipt.json"), "utf8")); } catch { return {}; } };
  r = await tty("");
  check(r.status === 0 && nrec().bell === false && /Type yes to turn it on \[no\]/.test(r.stdout), "in a terminal, Enter at the bell question leaves it off", r.stdout.slice(-300));
  r = await tty("yes");
  check(r.status === 0 && nrec().bell === true, "in a terminal, yes turns it on", r.stdout.slice(-300));
  r = await tty("sure");
  check(r.status === 0 && nrec().bell === false && /I didn't understand "sure"/.test(r.stdout) && /Type yes or no \[no\]/.test(r.stdout), "an answer that isn't yes or no is asked again, and Enter then leaves it off", r.stdout.slice(-400));
}

// A real update that stops at the Cloudflare sign-in says the old settings are still live (fake claude and npx; not on Windows).
if (process.platform !== "win32") {
  const bin = path.join(home, "fakebin"), cbin = path.join(home, ".local", "bin");
  fs.mkdirSync(bin, { recursive: true }); fs.mkdirSync(cbin, { recursive: true });
  fs.writeFileSync(path.join(bin, "npx"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  fs.writeFileSync(path.join(cbin, "claude"), "#!/bin/sh\necho '{\"loggedIn\":true}'\n", { mode: 0o755 });
  const real = spawnSync(process.execPath, [path.join(REPO, "install.mjs"), "--update", "--no-power-lanes", "--no-start", "--home", home],
    { encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}` } });
  check(real.status !== 0 && /sign-in didn't finish/.test(real.stderr) && /still use your old settings, including the command line switch/.test(real.stderr), "a stopped real update says Cloudflare and the running worker keep the old settings", real.stderr.slice(-300));
  const doc = spawnSync(process.execPath, [path.join(dir, "doctor.mjs"), "--dir", dir], { encoding: "utf8", env: { ...process.env, HOME: home } });
  check(/off in the new files, but Cloudflare and the running worker may still use your old setting/.test(doc.stdout), "the doctor says the same", doc.stdout.slice(-300));
}

// Windows isn't in this release: a real install there is refused before anything happens (a dry run still works).
const winHook = path.join(home, "as-windows.mjs");
fs.writeFileSync(winHook, `Object.defineProperty(process, "platform", { value: "win32" });\n`);
const win = spawnSync(process.execPath, [...(process.platform === "win32" ? [] : ["--import", pathToFileURL(winHook).href]), path.join(REPO, "install.mjs"), "--yes", "--home", path.join(home, "win")], { encoding: "utf8" });
check(win.status !== 0 && /Windows isn't in this release/.test(win.stderr) && !fs.existsSync(path.join(home, "win", "Projects")), "a real install on Windows is refused and changes nothing");

// MANUAL-INSTALL.md step 1 (--manual) builds the install in the real home folder, deploys nothing, and is refused with --update.
const mhome = path.join(home, "manual-home");
fs.mkdirSync(mhome);
const man = spawnSync(process.execPath, [path.join(REPO, "install.mjs"), "--manual", "--yes", "--name", "Tester", "--assistant", "Daisy"], { encoding: "utf8", env: { ...process.env, HOME: mhome, USERPROFILE: mhome } });
check(man.status === 0 && fs.existsSync(path.join(mhome, "Projects", "daisy-handoff", "site.json")) && JSON.parse(fs.readFileSync(path.join(mhome, "Projects", "daisy-handoff", "install-receipt.json"), "utf8")).dryRun === true, "--manual builds the install in your home folder and deploys nothing", man.stderr.slice(-300));
const mdir = path.join(mhome, "Projects", "daisy-handoff");
check(JSON.parse(fs.readFileSync(path.join(mdir, "install-receipt.json"), "utf8")).manual === true, "the receipt records a manual install");
const mdoc = spawnSync(process.execPath, [path.join(mdir, "doctor.mjs"), "--dir", mdir, "--offline"], { encoding: "utf8", env: { ...process.env, HOME: mhome, USERPROFILE: mhome } });
check(/MANUAL-INSTALL\.md, steps 2 to 7/.test(mdoc.stdout) && !/without --dry-run|install\.mjs --force/.test(mdoc.stdout), "the doctor sends a manual install on to MANUAL-INSTALL.md, never to --force", mdoc.stdout.slice(-400));
const plain = spawnSync(process.execPath, [path.join(REPO, "install.mjs"), "--dry-run", "--yes", "--home", mhome], { encoding: "utf8", env: { ...process.env, HOME: mhome, USERPROFILE: mhome } });
check(plain.status !== 0 && /--manual/.test(plain.stderr), "a plain dry run in your home folder is still refused, and points to --manual");
check(install(["--manual", "--update"]).status !== 0, "--manual with --update is refused");
check(!/Log out and back in/.test(mdoc.stdout) && !/Look at logs\/worker\.log/.test(mdoc.stdout), "the doctor never tells a manual-guide user to log out or read a log that doesn't exist yet", mdoc.stdout.slice(-400));
const again = spawnSync(process.execPath, [path.join(REPO, "install.mjs"), "--manual"], { encoding: "utf8", env: { ...process.env, HOME: mhome, USERPROFILE: mhome } });
check(again.status !== 0 && /already ran step 1 of MANUAL-INSTALL\.md/.test(again.stderr) && !/no terminal|--force/.test(again.stderr), "a second --manual is refused before any question and points back to the guide, not --force", again.stderr.slice(-300));
const mstop = spawnSync(process.execPath, ["--import", pathToFileURL(hook).href, path.join(REPO, "install.mjs"), "--update", "--dry-run", "--home", mhome], { encoding: "utf8", env: { ...process.env, HOME: mhome, USERPROFILE: mhome } });
check(mstop.status !== 0 && JSON.parse(fs.readFileSync(path.join(mdir, "install-receipt.json"), "utf8")).manual === true, "a stopped --update on a manual install keeps manual: true", mstop.stderr.slice(-300));

// An install with no receipt and no answer in its worker config: the update asks for a flag instead of turning things on.
fs.rmSync(path.join(dir, "install-receipt.json"));
const cfgPath = path.join(dir, "worker", "config.json"), cfg = json(path.join("worker", "config.json"));
delete cfg.powerLanes; fs.writeFileSync(cfgPath, JSON.stringify(cfg));
r = install(["--dry-run", "--update"]);
check(r.status !== 0 && /--no-power-lanes or --power-lanes/.test(r.stderr), "with no answer on record, the update stops and asks for a flag");

fs.rmSync(home, { recursive: true, force: true });
console.log(fail ? `update resume: ${fail} FAILED` : "update resume: all checks passed");
process.exit(fail ? 1 : 0);
