#!/usr/bin/env node
// Daisy Handoff doctor: checks this computer and your install for the common problems, says what to do about each,
// and saves a report you can attach to a bug report. Secrets are removed from the report; read it before you share it.
//
//   node doctor.mjs                  check this computer and the install it finds in ~/Projects
//   node doctor.mjs --dir PATH       check the install in PATH
//   node doctor.mjs --offline        skip the checks that use the network (your connector on Cloudflare)
//
// It only reads and asks. It never changes, restarts or deletes anything. Run it from the unzipped release folder
// (also: node install.mjs --doctor) or from your install folder, where the installer puts a copy.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const val = (f) => { const i = argv.indexOf(`--${f}`); const v = argv[i + 1]; return i >= 0 && v && !v.startsWith("--") ? v : undefined; };
if (argv.includes("--help")) {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 11).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
  process.exit(0);
}
const OFFLINE = argv.includes("--offline");
const MAC = process.platform === "darwin";
const HOME = os.homedir();
const HELP = "TROUBLESHOOTING.md";

const run = (cmd, args, o = {}) => spawnSync(cmd, args, { encoding: "utf8", timeout: 20000, shell: process.platform === "win32", ...o });
const which = (cmd) => { const r = run(process.platform === "win32" ? "where" : "which", [cmd]); return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : null; };
const read = (p) => { try { return fs.readFileSync(p, "utf8"); } catch { return null; } };
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const tailOf = (p, n) => (read(p) || "").split("\n").filter(Boolean).slice(-n);
const ago = (ms) => (ms < 90_000 ? `${Math.round(ms / 1000)} seconds` : ms < 5_400_000 ? `${Math.round(ms / 60_000)} minutes` : `${Math.round(ms / 3_600_000)} hours`);

const results = [];
const out = [];
const say = (s = "") => { console.log(s); out.push(s); };
// level: ok, warn (works, but worth fixing), fail (this stops it working). fix: what to do, in plain words.
function check(level, what, fix, section) {
  results.push({ level, what });
  say(`  ${level === "ok" ? "ok  " : level === "warn" ? "WARN" : "FAIL"}  ${what}`);
  if (level !== "ok" && fix) say(`        -> ${fix}${section ? ` (${HELP}: "${section}")` : ""}`);
}

// ---------- find the install ----------
function findInstall() {
  const given = val("dir");
  if (given) return path.resolve(given);
  if (fs.existsSync(path.join(HERE, "site.json"))) return HERE;
  const projects = path.join(HOME, "Projects");
  const found = (fs.existsSync(projects) ? fs.readdirSync(projects) : [])
    .filter((n) => /-handoff$/.test(n) && fs.existsSync(path.join(projects, n, "site.json")))
    .map((n) => path.join(projects, n))
    .sort((a, b) => fs.statSync(path.join(b, "site.json")).mtimeMs - fs.statSync(path.join(a, "site.json")).mtimeMs);
  return found[0] || null;
}
const DIR = findInstall();
const site = DIR ? readJson(path.join(DIR, "site.json")) : null;
const cfg = DIR ? readJson(path.join(DIR, "worker", "config.json")) : null;

// ---------- secrets to remove from the report ----------
const secrets = [];
if (DIR) for (const f of [".connector-key", ".worker-key", ".bell-key", ".lead-agent-key", ".connector-url"]) { const s = read(path.join(DIR, f)); if (s && s.trim().length >= 8) secrets.push(s.trim()); }
const user = os.userInfo().username;
function redact(text) {
  let t = String(text);
  for (const s of secrets.sort((a, b) => b.length - a.length)) t = t.split(s).join("[removed]");
  t = t.replace(/https:\/\/[a-z0-9.-]+\.workers\.dev(\/[^\s"']*)?/gi, "https://[your-connector].workers.dev[/removed]")
    .replace(/\b[0-9a-f]{32,}\b/gi, "[removed]")
    .replace(/\b(?:sk-(?:ant-)?|ghp_|gho_|github_pat_|xox[abposr]-|re_|ak_|AKIA|AIza|ya29\.)[A-Za-z0-9_.-]{10,}/g, "[removed]")
    .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, "[removed]")
    .replace(/((?:authorization|bearer|password|secret|token|api[_-]?key|cookie)["']?\s*[:=]\s*["']?)[^\s"',;]{6,}/gi, "$1[removed]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    .split(HOME).join("~");
  if (user.length >= 3) t = t.replace(new RegExp(`\\b${user.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), "[you]");
  return t;
}

// ---------- 1. this computer ----------
const VERSION = (read(path.join(HERE, "install.mjs")) || "").match(/const VERSION = "([^"]+)"/)?.[1] || site?.installer || "?";
say(`Daisy Handoff doctor (release ${VERSION}) | ${new Date().toString()}`);
say(`\n1. This computer`);
if (MAC) {
  const v = run("sw_vers", ["-productVersion"]).stdout?.trim() || "?";
  check(Number(v.split(".")[0]) >= 13 ? "ok" : "fail", `macOS ${v}`, "Daisy Handoff needs macOS 13 (Ventura) or newer.", "Before you start");
} else check("warn", `${os.type()} ${os.release()}`, "The background worker runs on macOS only in this version.", "Before you start");
const nodeMajor = Number(process.versions.node.split(".")[0]);
check(nodeMajor >= 22 ? "ok" : "fail", `Node ${process.versions.node}`, "Install Node 22 or newer from nodejs.org, then open a new Terminal window.", "Node is missing or too old");
check(which(process.platform === "win32" ? "npx.cmd" : "npx") ? "ok" : "fail", "npx (comes with Node)", "Reinstall Node from nodejs.org.", "Node is missing or too old");
if (MAC) {
  const clt = run("xcode-select", ["-p"]);
  check(clt.status === 0 ? "ok" : "fail", `Apple's Command Line Tools${clt.status === 0 ? "" : " are missing"} (they provide python3, which the phone bell uses)`,
    "In Terminal run: xcode-select --install   and click Install. It's free and takes a few minutes.", "Command Line Tools");
}
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
say(`  info  this computer's time zone: ${tz}`);

// ---------- 2. Claude Code ----------
say(`\n2. Claude Code`);
const claudeBin = [cfg?.claudeBin, path.join(HOME, ".local", "bin", process.platform === "win32" ? "claude.exe" : "claude")].find((p) => p && fs.existsSync(p)) || which("claude");
if (!claudeBin) check("fail", "Claude Code isn't installed", "Install it from claude.ai/code, then run claude and sign in.", "Claude Code isn't installed or signed out");
else {
  const ver = run(claudeBin, ["--version"]).stdout?.trim() || "?";
  check("ok", `Claude Code ${ver}`);
  const onPath = (process.env.PATH || "").split(path.delimiter).some((p) => path.resolve(p) === path.dirname(claudeBin));
  check(onPath ? "ok" : "warn", `claude ${onPath ? "is" : "isn't"} on your PATH`,
    `Typing claude in Terminal won't work yet. Run: echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc   then open a new Terminal window.`, "claude: command not found");
  const st = run(claudeBin, ["auth", "status"]);
  let auth = null;
  try { auth = JSON.parse(st.stdout); } catch {}
  if (auth?.loggedIn !== true) check("fail", "Claude Code is signed out", "Run claude, type /login, and sign in with your Claude account (Pro, Max, Team or Enterprise).", "Claude Code isn't installed or signed out");
  else {
    const method = String(auth.authMethod || auth.auth_method || "");
    const apiKey = /api.?key|console/i.test(method) || process.env.ANTHROPIC_API_KEY;
    check(apiKey ? "warn" : "ok", `Claude Code is signed in${method ? ` (${method})` : ""}`,
      apiKey ? "Phone notifications use Remote Control, which needs a claude.ai sign-in, not an API key. Run claude, /logout, then /login with your Claude account." : "", "No phone notifications");
  }
  for (const v of ["CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC", "DISABLE_GROWTHBOOK", "ANTHROPIC_BASE_URL"]) if (process.env[v])
    check("warn", `${v} is set`, "Remote Control (phone notifications) doesn't work while this is set. Remove it from your shell profile.", "No phone notifications");
}

// ---------- 3. the install ----------
say(`\n3. Your install`);
if (!DIR || !site) {
  check("warn", "no install found in ~/Projects", "If you haven't installed yet, that's expected: run node install.mjs. If you have, run: node doctor.mjs --dir ~/Projects/NAME-handoff");
} else {
  check("ok", `install folder ${redact(DIR)} (assistant ${site.assistant}, installer ${site.installer})`);
  if (site.timeZone && site.timeZone !== tz) check("warn", `schedules use ${site.timeZone}, but this computer is now on ${tz}`, "To switch, update with --time-zone (see README, Update).", "Schedules run at the wrong time");
  else if (site.timeZone) check("ok", `schedules use your time zone (${site.timeZone})`);
  else check("warn", "this install is from before time zones: schedules use US Central Time", "Update to the newest release to use your own time zone.", "Schedules run at the wrong time");
  const missing = [".connector-key", ".worker-key", ".bell-key", ".connector-url"].filter((f) => !fs.existsSync(path.join(DIR, f)));
  check(missing.length ? "fail" : "ok", missing.length ? `missing ${missing.join(", ")}` : "keys and connector URL are in place",
    "The install is incomplete. Run node install.mjs --uninstall, then node install.mjs --force.", "Install stopped partway");
  if (process.platform !== "win32") {
    // Every key file the installer makes, the lead agent key too when it's turned on. A missing file isn't "open".
    const open = [".connector-key", ".worker-key", ".bell-key", ".connector-url", ".lead-agent-key"].filter((f) => { try { return (fs.statSync(path.join(DIR, f)).mode & 0o077) !== 0; } catch { return false; } });
    check(open.length ? "warn" : "ok", open.length ? `others on this Mac can read ${open.join(", ")}` : "keys are readable only by you",
      `In the install folder run: chmod 600 ${open.join(" ")}`);
  }
  if (cfg) {
    const deployed = isDeployed(cfg.base);
    check(deployed ? "ok" : "fail", deployed ? "worker knows its connector" : "the connector was never deployed (this is a dry run, or the install stopped before Cloudflare)",
      "Run node install.mjs --uninstall, then node install.mjs --force, and finish the Cloudflare sign-in.", "Cloudflare sign-in or deploy failed");
    say(`  info  command line and desktop control: ${cfg.powerLanes ? "on" : "off"}`);
  }

  // An install made with --home (a test copy) has its services and Claude settings under that folder, not this account's.
  const live = path.resolve(site.home || HOME) === path.resolve(HOME);
  if (!live) say(`  info  this install was made for another home folder (--home), so the live service checks are skipped`);

  // background services
  if (MAC && live) {
    const agents = path.join(HOME, "Library", "LaunchAgents");
    const plists = fs.existsSync(agents) ? fs.readdirSync(agents).filter((f) => /^com\.daisy\..*\.plist$/.test(f)) : [];
    if (!plists.length) check("fail", "no background services are set up", "Run node install.mjs --uninstall, then node install.mjs --force.", "The worker isn't running");
    for (const f of plists) {
      const label = f.replace(/\.plist$/, "");
      const pr = run("launchctl", ["print", `gui/${process.getuid()}/${label}`]);
      const pid = pr.stdout?.match(/\bpid = (\d+)/)?.[1];
      const lastExit = pr.stdout?.match(/last exit code = (.+)/)?.[1];
      const plist = read(path.join(agents, f)) || "";
      const mine = plist.includes(DIR);
      check(pr.status === 0 && pid ? (mine ? "ok" : "warn") : "fail",
        `${label}: ${pr.status !== 0 ? "not loaded" : pid ? `running (pid ${pid})` : `loaded but not running${lastExit ? `, last exit ${lastExit}` : ""}`}${mine ? "" : ", and it belongs to a different install folder"}`,
        pr.status !== 0 || !pid ? "Log out and back in, or run node install.mjs --uninstall, then node install.mjs --force." : "Only one install per Mac account works. Uninstall the other one first.",
        "The worker isn't running");
    }
  }
  const alive = path.join(DIR, cfg?.aliveFile || "logs/.worker-alive");
  if (live && fs.existsSync(alive)) {
    const age = Date.now() - fs.statSync(alive).mtimeMs;
    // The alive file shows the worker's loop is running, not that it reached the connector (the live check below does that).
    check(age < 120_000 ? "ok" : "fail", `worker is running (its loop last ran ${ago(age)} ago)`, "The worker is stuck or stopped. Look at the end of logs/worker.log.", "The worker isn't running");
  } else if (live) check("fail", "the worker has never run", "Look at logs/worker.log in your install folder.", "The worker isn't running");

  // phone bell (Remote Control session)
  if (MAC && live) {
    const bellUrl = new URL(cfg?.bell?.url || "http://127.0.0.1:8790/notify");
    let bellUp = false;
    try { bellUp = (await fetch(`${bellUrl.origin}/health`, { signal: AbortSignal.timeout(3000) })).ok; } catch {}
    check(bellUp ? "ok" : "fail", `phone bell ${bellUp ? "is listening" : "isn't answering"}`, "See the section on phone notifications.", "No phone notifications");
    const claudeJson = readJson(path.join(HOME, ".claude.json"));
    const trusted = claudeJson?.projects?.[path.join(DIR, "jarvis-bell")]?.hasTrustDialogAccepted === true;
    check(trusted ? "ok" : "fail", `Claude Code ${trusted ? "trusts" : "doesn't trust"} the bell folder yet`,
      `The Daisy bell runs in ${path.join(DIR, "jarvis-bell")} (an older internal name). Run: cd "${path.join(DIR, "jarvis-bell")}" && claude   then choose "Yes, I trust this folder" and type /exit right away. The bell restarts by itself within a few minutes.`, "No phone notifications");
    const screen = (read(path.join(DIR, "logs", "bell-screen.log")) || "").slice(-20000).replace(/\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b\][^\x07]*\x07/g, " ").replace(/\s+/g, " ").toLowerCase();
    const known = [
      [/do you trust the files|trust this folder|workspace not trusted/, "The bell session is waiting at Claude Code's folder trust question."],
      [/let's get started|choose the text style|select a theme|dark mode \(colorblind/, "The bell session is stuck on Claude Code's first-run setup screen. In Terminal run claude once, finish the setup, type /login, then /exit. The bell restarts by itself within a few minutes."],
      [/not logged in|please run \/login|invalid api key/, "The bell session isn't signed in to Claude."],
      [/remote control is disabled|disabled by your organization/, "Remote Control is turned off for your account. On Team or Enterprise an Owner turns it on in Claude Code admin settings."],
      [/channels? (?:are |is )?(?:not enabled|blocked|disabled)|ask (?:an|your) admin to enable/, "Channels are turned off for your organization. An Owner turns them on in Claude Code admin settings."],
      [/no mobile registered/, "Your phone isn't registered for pushes yet. Open the Claude app on your phone, signed in to the same account."],
    ].filter(([re]) => re.test(screen)).map(([, why]) => why);
    for (const why of known) check("fail", `bell session: ${why}`, "", "No phone notifications");
    const rcOn = /remote control (active|connected)|claude\.ai\/code/.test(screen);
    if (!known.length && screen) check(rcOn ? "ok" : "warn", rcOn ? "bell session shows Remote Control on" : "bell session screen doesn't show Remote Control on yet, and shows none of the known problems",
      "If pushes still don't arrive, check the Claude app's notification settings and /config push settings.", "No phone notifications");
  }

  // desktop control
  if (MAC && live && cfg?.powerLanes) {
    const drv = cfg.host?.driverBin;
    const has = drv && fs.existsSync(drv);
    check(has ? "ok" : "warn", `desktop control helper (CuaDriver) ${has ? "is installed" : "isn't installed"}`,
      "Commands and screenshots still work. Using your desktop needs the free CuaDriver app from trycua, plus Accessibility and Screen Recording for it.", "Desktop control doesn't work");
    if (has) {
      const p = run(drv, ["permissions", "status", "--json"]);
      let j = null; try { j = JSON.parse(p.stdout); } catch {}
      const miss = j ? ["accessibility", "screen_recording"].filter((k) => j[k] === false) : [];
      if (j) check(miss.length ? "fail" : "ok", miss.length ? `CuaDriver is missing ${miss.join(" and ")}` : "CuaDriver has Accessibility and Screen Recording",
        "System Settings > Privacy & Security: turn on CuaDriver under Accessibility and under Screen & System Audio Recording.", "Desktop control doesn't work");
    }
  }

  // the connector, from outside. The key only ever goes to the connector this install recorded as deployed, never to the
  // placeholder address a dry run or the manual install's example leaves behind (anyone could claim that address).
  const full = (read(path.join(DIR, ".connector-url")) || "").trim();
  const sendable = isDeployed(cfg?.base) && full.startsWith(`${cfg.base}/`) && !/your-subdomain\.workers\.dev/.test(full);
  if (!OFFLINE && live && full && !sendable) {
    check("warn", "skipped the live connector check: no deployed connector address is on record, so your key wasn't sent anywhere",
      "Finish the Cloudflare step (README, Install, or MANUAL-INSTALL step 3 to 5), then run the doctor again.", "Cloudflare sign-in or deploy failed");
  } else if (!OFFLINE && live && full) {
    try {
      const r = await fetch(full, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "doctor", version: VERSION } } }),
        signal: AbortSignal.timeout(10000) });
      check(r.status === 200 ? "ok" : "fail", `connector on Cloudflare answers your key (HTTP ${r.status})`,
        r.status === 404 ? "The key doesn't match. If you rotated it, add the connector in Claude again with the new URL." : "Check your Cloudflare dashboard, Workers & Pages.", "Claude can't reach the connector");
    } catch (e) { check("fail", `connector on Cloudflare didn't answer (${e.name})`, "Check your internet connection, then your Cloudflare dashboard.", "Claude can't reach the connector"); }
  }

  // recent log lines
  for (const f of ["worker.log", "supervisor.log", "jarvis-bell.log", "bell.log"]) {
    const lines = tailOf(path.join(DIR, "logs", f), 15);
    if (lines.length) { out.push(`\n--- last ${lines.length} lines of logs/${f} ---`); out.push(...lines); }
  }
  const receipt = read(path.join(DIR, "install-receipt.json"));
  if (receipt) { out.push("\n--- install-receipt.json ---"); out.push(receipt.trim()); }
}

// A connector address the installer really deployed: not the dry run's placeholder, not the manual guide's example.
function isDeployed(base) {
  return typeof base === "string" && /^https:\/\/[a-z0-9.-]+\.workers\.dev$/.test(base) && !/your-subdomain\.workers\.dev$/.test(base);
}

// ---------- summary and report ----------
const fails = results.filter((r) => r.level === "fail").length;
const warns = results.filter((r) => r.level === "warn").length;
say(`\n${fails ? `${fails} problem(s) found` : "No problems found"}${warns ? `, ${warns} warning(s)` : ""}. Each one above says what to do; ${HELP} explains more.`);
const reportDir = DIR && fs.existsSync(path.join(DIR, "logs")) ? path.join(DIR, "logs") : process.cwd();
const report = path.join(reportDir, `doctor-report-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}.txt`);
try {
  fs.writeFileSync(report, redact(out.join("\n")) + "\n", { mode: 0o600 });
  console.log(`Report saved with keys, URLs, emails and your user name removed: ${report}`);
  console.log("Read it before you share it, and never paste your connector URL anywhere.");
} catch (e) { console.log(`Couldn't save the report (${e.message}).`); }
process.exit(fails ? 1 : 0);
