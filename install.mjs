#!/usr/bin/env node
// Nuff Said installer for macOS. (The Windows code paths are here for testing and aren't in this release.)
//
//   node install.mjs                install for real (5 questions, one Cloudflare sign-in in your browser)
//   node install.mjs --dry-run      build a full install in a throwaway folder; deploys nothing, starts nothing
//   node install.mjs --manual       step 1 of MANUAL-INSTALL.md: the same, but in your real home folder
//   node install.mjs --uninstall    stop the background worker and remove its startup entry (your files stay)
//   node install.mjs --doctor       check this computer and your install, and save a report with secrets removed
//   node install.mjs --update       update an install in place: same keys, same connector URL, same Worker and database,
//                                   same answers as last time (change one with its flag, e.g. --no-power-lanes)
//   node install.mjs --rotate-keys  if your URL or a key leaked: new connector, worker and lead agent keys, a list of
//                                   schedules, routines and running and waiting jobs to check, then the worker restarted
//   node install.mjs --clear-schedules  turn off every schedule, delete every routine, stop running jobs and cancel waiting
//                                   ones (alone or with --rotate-keys)
//
//   Other flags: --name NAME  --assistant NAME  --machine NAME  --yes (take the defaults)
//                --time-zone ZONE (schedules use this computer's time zone; e.g. --time-zone America/New_York to pick another)
//                --home DIR (install as if DIR were your home)  --force (replace an existing install, old one backed up)
//                --platform darwin|win32 (only with --dry-run: write the other OS's files, for testing)
//                --no-start (deploy for real, write the startup files, but don't start the worker)
//                --no-power-lanes (turn off the command line and desktop control, which are on by default)
//                --lead-agent NAME (let one named agent approve held actions for you; off by default, see the README)
//                --no-lead-agent (with --update: turn the lead agent off again; your connector URL stays the same)
//                --bell (phone notifications on; they're off unless you say yes, because the bell answers Claude Code's
//                development-channel warning for you each time it starts)  --no-bell (turn them off again)
//
// Needs Node 22.13+ and Claude Code signed in. Runs on Cloudflare's free tier (one Worker, one D1 database).
// It never prints your connector URL or keys. The URL works like a password: it goes to your clipboard
// and to a private file in the install folder, nowhere else.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import readline from "node:readline/promises";

const VERSION = "0.9.1";
const WRANGLER = "wrangler@4.151.3";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.join(HERE, "template");
// Shown before the command line and desktop control question. Same substance as README, SECURITY.md and RELEASE_NOTES.md.
const UPGRADES = [
  "ALTER TABLE job_messages ADD COLUMN sender TEXT",
  "ALTER TABLE jobs ADD COLUMN created_by TEXT",
  "ALTER TABLE jobs ADD COLUMN followup_from TEXT",
  "ALTER TABLE schedules ADD COLUMN created_by TEXT",
  "ALTER TABLE routines ADD COLUMN created_by TEXT",
];
const LEAD_WARNING = (name) => [
  `lead agent "${name}" can approve held actions for you (sends, posts, spending, deletes). Off unless you ask for it.`,
  "Every approval it gives is logged as that agent, never as you. It proves itself with .lead-agent-key, but any job on",
  "this computer can read that file, so a job that was tricked could approve for you too. Turn it on only if you accept that.",
];
const POWER_WARNING = [
  "Read this first. This ships with the command line and desktop control turned on, the way the author uses it.",
  "That means a job can do anything you can do at your keyboard: run commands, change or delete files, open apps,",
  "click and type on your desktop, using your logins. A leaked connector URL or a prompt injection in a web page or",
  "email could cause real damage. Sends, posts, spending, deletes and access changes stop for your yes unless you",
  "asked for them. That lowers the risk but doesn't remove it. To turn it off, answer no here or rerun the installer",
  "with --no-power-lanes. Install it only on a computer you trust it with. Desktop control is Mac only for now.",
];
// Shown at install, Mac only: what the phone bell answers for you. Same substance as README, SECURITY.md and RELEASE_NOTES.md.
const BELL_NOTE = [
  "Phone notifications: the bell is a Claude Code session with Remote Control on that gets each finished job through Claude",
  "Code channels, a research preview. The bell's channel isn't on Anthropic's approved list, so it uses Claude Code's",
  "developer flag for channels (--dangerously-load-development-channels). That flag shows a warning Anthropic meant for people",
  "testing their own channels, answered \"I am using this for local development\", every time the bell starts. Nobody is at",
  "that terminal, so the bell picks that answer for you each time, and says yes to its own MCP server. Without the bell,",
  "jobs work the same; you just get no phone notifications. It stays off unless you say yes. Turn it off later with --update --no-bell.",
];
// The bell question itself carries the one sentence that matters, so nobody turns it on without reading it.
const BELL_QUESTION = "Turn on phone notifications? The bell uses a Claude Code development channel (a research preview), and Nuff Said " +
  "answers Claude Code's \"I am using this for local development\" warning for you each time the bell starts. Type yes to turn it on";
const HOST = process.platform; // the OS we are really running on
// While an update runs: what is still on your old settings if it stops now (set by main as it goes).
let stillOld = null;

// ---------- arguments ----------
const argv = process.argv.slice(2);
const has = (f) => argv.includes(`--${f}`);
const val = (f) => { const i = argv.indexOf(`--${f}`); const v = argv[i + 1]; return i >= 0 && v && !v.startsWith("--") ? v : undefined; };
if (has("doctor")) { // the doctor lives in its own file, so the installer copies it into every install
  const d = spawnSync(process.execPath, [path.join(HERE, "doctor.mjs"), ...argv.filter((a) => a !== "--doctor")], { stdio: "inherit" });
  process.exit(d.status ?? 1);
}
const KNOWN = new Set(["dry-run", "uninstall", "yes", "force", "help", "name", "assistant", "machine", "home", "platform", "no-start", "no-power-lanes", "power-lanes", "lead-agent", "no-lead-agent", "bell", "no-bell", "manual", "time-zone",
  "update", "rotate-keys", "clear-schedules"]);
for (const a of argv) if (a.startsWith("--") && !KNOWN.has(a.slice(2))) die(`unknown option ${a} (try --help)`);
if (has("help")) {
  const lines = fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n");
  const head = lines.slice(1, lines.findIndex((l, i) => i > 0 && !l.startsWith("//")));
  console.log(head.map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
  process.exit(0);
}
// --manual: step 1 of MANUAL-INSTALL.md. Builds your install in your real home folder like a dry run: nothing deployed or started.
const MANUAL = has("manual");
const DRY = has("dry-run") || MANUAL;
if (MANUAL && ["update", "rotate-keys", "clear-schedules", "uninstall", "platform"].some(has)) die("--manual is only for step 1 of MANUAL-INSTALL.md, on its own.");
const PLATFORM = val("platform") || HOST;
if (val("platform") && !DRY) die("--platform only works together with --dry-run");
const MAC = PLATFORM === "darwin";
const WIN = PLATFORM === "win32";
if (!MAC && !WIN) die(`this installer supports macOS and Windows; this computer reports "${PLATFORM}"`);
const SIM = PLATFORM !== HOST; // writing another OS's files: nothing gets run
// The Windows worker is still in testing: a real install there is refused, a practice one (--dry-run) is fine.
if (WIN && !SIM && !DRY && !has("uninstall")) die("Windows isn't in this release. The Windows worker is still in testing. You can try a practice install with --dry-run.");
// A dry run never touches your real home folder unless you point it somewhere with --home.
const HOME = path.resolve(val("home") || (DRY && !MANUAL ? fs.mkdtempSync(path.join(os.tmpdir(), "handoff-dry-")) : os.homedir()));

// ---------- output ----------
const steps = [];
const say = (s = "") => console.log(s);
const ok = (s) => { say(`  ok    ${s}`); steps.push(["ok", s]); };
const note = (s) => { say(`  note  ${s}`); steps.push(["note", s]); };
const skip = (s) => { say(`  skip  ${s}`); steps.push(["skip", s]); };
function die(s) { console.error(`\nSTOPPED: ${s}${stillOld ? `\n${stillOld}` : ""}`); process.exit(1); }
let stepNo = 0;
const step = (t, total) => { stepNo++; say(`\n[${stepNo}/${total}] ${t}`); };
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const run = (cmd, args, o = {}) => spawnSync(cmd, args, { encoding: "utf8", shell: HOST === "win32", ...o });
const which = (cmd) => { const r = run(HOST === "win32" ? "where" : "which", [cmd]); return r.status === 0 ? r.stdout.split(/\r?\n/)[0].trim() : null; };
const tail = (r) => `${r.stderr || ""}\n${r.stdout || ""}`.trim().split("\n").slice(-3).join(" | ");
const fwd = (p) => p.replace(/\\/g, "/"); // Node on Windows accepts forward slashes; they also survive inside JS string literals
const bk = (p) => p.replace(/\//g, "\\");

function writeSecret(p, s) {
  fs.writeFileSync(p, s, { mode: 0o600 });
  if (HOST !== "win32") fs.chmodSync(p, 0o600); // the mode above only applies to a new file
  if (HOST === "win32" && !SIM) run("icacls", [p, "/inheritance:r", "/grant:r", `${os.userInfo().username}:F`]);
}

// ---------- uninstall, key change ----------
if (has("uninstall")) { uninstall(); process.exit(0); }
// A dry run moves folders and writes key files in its home folder like a real run, so never in your real one.
if (DRY && !MANUAL && path.resolve(HOME) === path.resolve(os.homedir())) die("a dry run can't use your real home folder, so your install is left alone. Leave out --home, or point it at a test folder like /tmp/nuff-test. (For MANUAL-INSTALL.md step 1, use --manual.)");
if (has("rotate-keys") || has("clear-schedules")) { await rotateKeys(); process.exit(0); }

function uninstall() {
  say(`Nuff Said uninstall ${VERSION} | ${MAC ? "macOS" : "Windows"}${DRY ? " | DRY RUN" : ""}`);
  const bak = path.join(HOME, ".handoff-uninstalled", stamp());
  let n = 0;
  if (MAC) {
    const agents = path.join(HOME, "Library", "LaunchAgents");
    const plists = fs.existsSync(agents) ? fs.readdirSync(agents).filter((f) => /^com\.daisy\..*\.plist$/.test(f)) : [];
    for (const f of plists) {
      const p = path.join(agents, f);
      const was = !DRY && !SIM && run("launchctl", ["bootout", `gui/${process.getuid()}`, p]).status === 0;
      if (!DRY) { fs.mkdirSync(bak, { recursive: true }); fs.renameSync(p, path.join(bak, f)); }
      ok(`${DRY ? "would stop" : was ? "stopped" : "removed (it wasn't running)"} ${f.replace(/\.plist$/, "")}`); n++;
    }
  } else {
    const startup = path.join(HOME, "AppData", "Roaming", "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
    const launchers = fs.existsSync(startup) ? fs.readdirSync(startup).filter((f) => / Handoff\.cmd$/.test(f)) : [];
    for (const f of launchers) {
      const title = f.replace(/\.cmd$/, "");
      if (!DRY && !SIM) run("taskkill", ["/FI", `WINDOWTITLE eq ${title}*`, "/T", "/F"]);
      if (!DRY) { fs.mkdirSync(bak, { recursive: true }); fs.renameSync(path.join(startup, f), path.join(bak, f)); }
      ok(`${DRY ? "would stop" : "stopped"} ${title}`); n++;
    }
  }
  if (!n) say(DRY && !val("home") ? "  no Nuff Said worker in this dry run's practice folder (a dry run doesn't look at your real install; add --home to point it at one)" : "  no Nuff Said worker found for this user");
  else if (!DRY) say(`\nStartup entries moved to ${bak} (not deleted).`);
  // The database name, when there's exactly one install to name it from.
  const projects = path.join(HOME, "Projects");
  const installs = fs.existsSync(projects) ? fs.readdirSync(projects).filter((n) => /-handoff$/.test(n) && fs.existsSync(path.join(projects, n, "site.json"))) : [];
  const db = installs.length === 1 ? `${installs[0]}-jobs` : "NAME-handoff-jobs";
  say("Your install folder and Cloudflare connector are untouched. To remove everything, follow the README's Uninstall");
  say(`steps: in the install folder run  npx -y ${WRANGLER} delete --force  and  npx -y ${WRANGLER} d1 delete ${db} -y,`);
  say("delete the install folder, and remove the connector in Claude under Customize > Connectors.");
}

// ---------- install ----------
await main();

async function main() {
  const TOTAL = 7;
  const UPDATE = has("update");
  if (UPDATE && has("force")) die("use --update or --force, not both. --update keeps your keys and connector URL; --force makes new ones.");
  say(`Nuff Said ${UPDATE ? "update" : "installer"} ${VERSION} | ${MAC ? "macOS" : "Windows"}${SIM ? " (simulated)" : ""}${DRY ? " | DRY RUN: nothing deployed, nothing started" : ""}`);
  if (!UPDATE) say("Nuff Said is made for Claude. It's an independent project, not made by, affiliated with or endorsed by Anthropic.");
  // A dry run works in a throwaway folder, so a dry-run update needs a practice install there to update. It never touches yours.
  if (UPDATE && DRY && !val("home")) die("a dry-run update needs a practice install to update. Make one, then update it:\n" +
    "  node install.mjs --dry-run --yes --home /tmp/nuff-test\n  node install.mjs --update --dry-run --home /tmp/nuff-test\nA dry run never touches your real install.");
  if (!fs.existsSync(TEMPLATE)) die(`no template folder next to install.mjs (looked for ${TEMPLATE}). Unzip the whole release and run it from that folder.`);
  // An update keeps last time's answers (site.json and install-receipt.json in the install folder) unless a flag changes one.
  const prev = UPDATE ? findInstall() : null;
  // Schedules and the times Claude reads out use the owner's own time zone: this computer's, or --time-zone.
  const timeZone = val("time-zone") || prev?.site.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  try { new Intl.DateTimeFormat("en-US", { timeZone }); } catch { die(`"${timeZone}" isn't a time zone name. Use one like America/New_York, Europe/London or Asia/Tokyo.`); }

  // 1. preflight
  step("Checking this computer", TOTAL);
  // 22.13: the first Node 22 that runs node:sqlite (used by the tests) without a flag. Cloudflare's tool needs 22 too.
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 13)) die(`Node ${process.versions.node} is too old. Install Node 22.13 or newer from nodejs.org, then open a new Terminal window and run this again.`);
  ok(`Node ${process.versions.node}`);
  const claudeBin = findClaude();
  if (!claudeBin) (DRY ? note : die)("Claude Code isn't installed. Install it with the command on code.claude.com/docs/en/setup, sign in, then run this again.");
  else {
    ok(`Claude Code at ${claudeBin}`);
    if (!SIM) {
      const s = run(claudeBin, ["auth", "status"]);
      let signedIn = null;
      try { signedIn = JSON.parse(s.stdout).loggedIn; } catch {}
      if (signedIn === true) ok("Claude Code is signed in");
      else (DRY ? note : die)("Claude Code is installed but signed out. Run `claude`, type /login, then run this again. Every job fails with 'Not logged in' until you do.");
    }
  }
  if (!DRY && !which(HOST === "win32" ? "npx.cmd" : "npx")) die("npx is missing. It comes with Node; reinstall Node from nodejs.org.");

  // 2. identity
  step("About you", TOTAL);
  const ask = await asker();
  const owner = clean(val("name") || prev?.site.owner || (await ask("Your first name", os.userInfo().username)));
  const assistant = clean(val("assistant") || prev?.site.assistant || (await ask("What do you call your assistant", "Daisy")));
  const machine = clean(val("machine") || prev?.site.machine || (await ask("What do you call this computer", MAC ? "Mac" : "PC")));
  // Shell commands and desktop control are on by default, the way the author runs it. --no-power-lanes or a no turns them off.
  // --power-lanes (the old opt-in flag) is still accepted and just means on.
  // An update keeps the old answer: from the receipt, or from the old worker config if an earlier update stopped before
  // writing one. Never "on" by default: if neither says, it asks again.
  const prevPower = !prev ? null : typeof prev.receipt.powerLanes === "boolean" ? prev.receipt.powerLanes : typeof prev.config.powerLanes === "boolean" ? prev.config.powerLanes : null;
  const keepPower = prev && !has("no-power-lanes") && !has("power-lanes") ? prevPower : null;
  if (prev && keepPower === null && !has("no-power-lanes") && !has("power-lanes")) die("couldn't tell whether your install had the command line and desktop control on. Run the update again with --no-power-lanes or --power-lanes. Nothing was changed.");
  if (!has("no-power-lanes") && keepPower !== false) for (const l of POWER_WARNING) say(`  ${l}`);
  const power = keepPower ?? (!has("no-power-lanes") && (has("power-lanes") ||
    !/^n(o)?$/i.test(await ask("Let jobs use the command line and control this computer's desktop? This is how the author runs it.", "yes"))));
  // The phone bell: off unless the person says yes (--bell, or yes to the question), after reading what it answers for them.
  // --yes takes the default, which is off. An update keeps last time's answer; an install from before the question
  // (no answer on record) gets the question once, so an update never turns it on, or keeps it on, without a yes.
  if (has("bell") && has("no-bell")) die("use --bell or --no-bell, not both.");
  const prevBell = prev && typeof prev.receipt.bell === "boolean" ? prev.receipt.bell : null;
  let bell = MAC && (has("no-bell") ? false : has("bell") ? true : prevBell);
  if (MAC && (bell === null || (has("bell") && prevBell !== true))) for (const l of BELL_NOTE) say(`  ${l}`);
  if (bell === null) bell = /^y(es)?$/i.test(await ask(BELL_QUESTION, "no"));
  ask.close();
  // Only the owner, from their own Claude chat, can clear an approval stop. --lead-agent NAME lets that one agent do it too.
  const prevLead = prev ? ("leadAgent" in prev.receipt ? prev.receipt.leadAgent : /^LEAD_AGENT = "([^"]*)"$/m.exec(prev.toml)?.[1]) : null;
  if (has("lead-agent") && has("no-lead-agent")) die("use --lead-agent NAME or --no-lead-agent, not both.");
  const lead = has("no-lead-agent") ? "" : (val("lead-agent") || (has("lead-agent") ? "" : prevLead) || "").replace(/[^\w .:-]/g, "").trim().slice(0, 40);
  if (has("lead-agent") && !lead) die("--lead-agent needs a name, e.g. --lead-agent captain");
  const dropLead = !!(prevLead && !lead); // turned off on this update: its key comes off Cloudflare too
  const { base, slug } = slugOf(assistant);
  const dotdir = `.${base}`;
  const dir = path.join(HOME, "Projects", slug);
  if (prev && dir !== prev.dir) die(`--update keeps the assistant's name (${prev.site.assistant}); a new name is a new install. Nothing was changed.`);
  ok(`${owner}'s assistant ${assistant}, on the ${machine}`);
  ok(`install folder ${dir}`);
  ok(`schedules use your time zone, ${timeZone} (another one: --time-zone)`);
  if (lead) for (const l of LEAD_WARNING(lead)) note(l);
  else ok(`approvals are refused for agents that call your URL directly; your own Claude chat counts as you (see SECURITY.md)${dropLead ? `. Lead agent "${prevLead}" turned off` : ""}`);
  (power ? note : ok)(`command line and desktop control ${power ? "on: jobs can run shell commands and use this computer's desktop (turn off: rerun the installer with --no-power-lanes)" : "off (turn on: rerun the installer with --power-lanes, or answer yes)"}`);

  const agents = path.join(HOME, "Library", "LaunchAgents");
  const taken = MAC && fs.existsSync(path.join(agents, "com.daisy.handoff-worker.plist"));
  if ((fs.existsSync(dir) || taken) && !has("force") && !UPDATE) {
    die(`${taken ? "a Nuff Said worker is already installed for this user" : `${dir} already exists`}. Nothing was changed. ` +
      "Run with --uninstall first, or --force to replace it (the old folder is kept as a backup).");
  }
  if (MAC && !DRY && !SIM && !has("no-start") && !UPDATE) {
    const live = ["com.daisy.handoff-worker", "com.daisy.supervisor"].filter((l) => run("launchctl", ["print", `gui/${process.getuid()}/${l}`]).status === 0);
    if (live.length) die(`a Nuff Said worker (${live.join(", ")}) is already running for this user. Starting another would replace it, so nothing was changed. Use --uninstall first, or --no-start to deploy without starting.`);
  }
  let bak = null;
  if (fs.existsSync(dir)) {
    bak = `${dir}.bak-${stamp()}`;
    for (let i = 2; fs.existsSync(bak); i++) bak = `${dir}.bak-${stamp()}-${i}`; // two runs in one second
    fs.renameSync(dir, bak); note(`old folder kept at ${bak}`);
  }

  // 3. render
  step("Building your copy", TOTAL);
  const home = fwd(HOME);
  const worker = workerConfig(home, claudeBin, slug, power, bell);
  const tokens = {
    HOME: home, USER: os.userInfo().username, SLUG: slug, DOTDIR: dotdir, MACHINE: machine, ASSISTANT: assistant,
    OWNER: owner, OWNER_UPPER: owner.toUpperCase(),
    HE: owner, HE_CAP: owner, HIM: owner, HIS: `${owner}'s`, HIS_CAP: `${owner}'s`,
    ALARM_TO: "alarm-off@example.invalid", ALARM_FROM: "alarm-off@example.invalid",
    VM_LANE: "off",
    POWER_LANES: power ? "on" : "off",
    TIME_ZONE: timeZone,
    LEAD_AGENT: lead,
    WORKER_CONFIG_JSON: JSON.stringify(worker, null, 2),
  };
  const n = render(TEMPLATE, dir, tokens);
  if (UPDATE) carryOver(bak, dir, bell);
  fs.mkdirSync(path.join(dir, "logs"), { recursive: true });
  fs.writeFileSync(path.join(dir, "site.json"), JSON.stringify({ owner, assistant, machine, home, slug, dotdir, platform: PLATFORM, installer: VERSION, timeZone }, null, 2) + "\n");
  fs.copyFileSync(path.join(HERE, "doctor.mjs"), path.join(dir, "doctor.mjs"));
  // This run's answers, before anything can stop it partway, so a second try keeps them. The full receipt replaces it at the end.
  fs.writeFileSync(path.join(dir, "install-receipt.json"), JSON.stringify({ installer: VERSION, unfinished: true, at: new Date().toISOString(), ...(MANUAL ? { manual: true } : {}), slug, powerLanes: power, leadAgent: lead || null, bell, timeZone,
    ...(UPDATE ? { updatedFrom: prev.receipt.updatedFrom || prev.receipt.installer || prev.site.installer || null } : {}) }, null, 2) + "\n");
  ok(`${n} files written, every placeholder filled, plus doctor.mjs`);
  if (UPDATE && !DRY) stillOld = "Nothing changed on Cloudflare or in the running worker: they still use your old settings, including the command line switch, until the update finishes. Run node install.mjs --update again.";
  if (MAC) {
    const nodeBin = (!SIM && which("node")) || process.execPath;
    const nb = path.join(HOME, dotdir, "node", "bin");
    fs.mkdirSync(nb, { recursive: true });
    fs.rmSync(path.join(nb, "node"), { force: true });
    fs.symlinkSync(nodeBin, path.join(nb, "node"));
    ok(`worker will run on ${nodeBin}`);
  }

  // 4. keys
  step(UPDATE ? "Keeping your private keys" : "Making private keys", TOTAL);
  const keyFiles = [".connector-key", ".worker-key", ".bell-key", ...(lead ? [".lead-agent-key"] : [])];
  let kept = 0;
  for (const f of keyFiles) {
    const old = UPDATE ? path.join(bak, f) : null;
    if (old && fs.existsSync(old)) { writeSecret(path.join(dir, f), fs.readFileSync(old, "utf8").trim()); kept++; }
    else writeSecret(path.join(dir, f), randomBytes(32).toString("hex"));
  }
  // The old URL too, until the deploy writes it again: if this update stops partway, the next try still knows the URL.
  if (UPDATE && fs.existsSync(path.join(bak, ".connector-url"))) writeSecret(path.join(dir, ".connector-url"), fs.readFileSync(path.join(bak, ".connector-url"), "utf8"));
  ok(UPDATE ? `${kept} keys kept from your install${keyFiles.length > kept ? `, ${keyFiles.length - kept} new` : ""}, readable only by you` : `${keyFiles.length} keys made on this computer, readable only by you`);

  // 5. cloudflare
  step("Putting your connector on Cloudflare", TOTAL);
  let url;
  if (DRY) {
    url = `https://${slug}.your-subdomain.workers.dev`;
    skip(`deploy (dry run). For real: wrangler login, d1 create ${slug}-jobs, d1 execute schema.sql, deploy, 2 secrets`);
  } else url = deploy(dir, slug, lead, UPDATE && dropLead);
  setWorkerBase(dir, url);
  writeSecret(path.join(dir, ".connector-url"), `${url}/${fs.readFileSync(path.join(dir, ".connector-key"), "utf8").trim()}/mcp`);
  ok("worker pointed at the connector; private URL saved in .connector-url");
  const sameUrl = UPDATE && fs.existsSync(path.join(bak, ".connector-url")) && fs.readFileSync(path.join(bak, ".connector-url"), "utf8") === fs.readFileSync(path.join(dir, ".connector-url"), "utf8");
  if (UPDATE) (sameUrl ? ok : note)(sameUrl ? "your connector URL is the same as before" : "your connector URL changed: add the connector in Claude again with the new URL");

  // 6. background worker
  step("Starting the worker at login", TOTAL);
  if (MAC && bell) { ok("phone bell on: it answers Claude Code's development-channel warning for you each time it starts (turn off: --update --no-bell)"); trustBellFolder(dir); }
  else if (MAC) ok("phone notifications off: no bell session (turn on: --update --bell)");
  if (MAC) installMac(dir, bell); else installWin(dir, assistant);
  stillOld = null;
  if (!DRY) {
    const s = await smokeCheck(fs.readFileSync(path.join(dir, ".connector-url"), "utf8").trim());
    if (s.ok) ok(`live check passed: your connector answers your key with ${s.tools} tools and turns away a wrong key (HTTP ${s.badStatus})`);
    else note(`live check didn't pass yet (${s.why}). Give it a minute, then say "check updates" in Claude.`);
  }

  // 7. hand-off to the person
  const urlFile = path.join(dir, ".connector-url");
  if (sameUrl) {
    step("Nothing to do in Claude", TOTAL);
    say("  Your connector URL didn't change, so the connector you already added in Claude keeps working.");
    say("  Jobs that were running when the worker restarted go back in the queue and start again.");
  } else await handOff(dir, urlFile, assistant, bell);

  fs.writeFileSync(path.join(dir, "install-receipt.json"), JSON.stringify({
    installer: VERSION, platform: PLATFORM, simulated: SIM, dryRun: DRY, ...(MANUAL ? { manual: true } : {}), at: new Date().toISOString(), slug, powerLanes: power, leadAgent: lead || null, bell, timeZone,
    ...(UPDATE ? { updatedFrom: (prev.receipt.unfinished ? prev.receipt.updatedFrom : prev.receipt.installer) || prev.site.installer || null } : {}), steps,
  }, null, 2) + "\n");
  say(`\n${DRY ? "DRY RUN COMPLETE" : UPDATE ? "UPDATE COMPLETE" : "INSTALL COMPLETE"}  (${dir})`);
}

async function handOff(dir, urlFile, assistant, bell) {
  step("Last step is yours (about a minute)", 7);
  let copied = false;
  if (!DRY && !SIM) {
    const c = HOST === "darwin" ? run("pbcopy", [], { input: fs.readFileSync(urlFile, "utf8"), shell: false }) : run("clip", [], { input: fs.readFileSync(urlFile, "utf8") });
    copied = c.status === 0;
  }
  say(`  1. In Claude (claude.ai or the desktop app): Customize > Connectors > + Add > Add custom connector.`);
  say(`  2. Name it "Nuff Said", paste the URL ${copied ? "(it's on your clipboard now; " : "("}also in ${urlFile}) and click Continue.`);
  say(`     Under Authentication choose "No sign in", leave Request headers empty, and click Add.`);
  say(`  3. On your phone, open the Claude app, start voice, and say: "Check updates with ${assistant}."`);
  if (MAC && bell) {
    say(`  For a phone notification when a job finishes (once, about a minute):`);
    say(`  4. On your phone, sign in to the Claude app with the same account as Claude Code, and allow notifications.`);
    say(`  5. In Terminal run claude, type /config, turn on "Push when Claude decides", then type /exit.`);
  }
  say(`  If something doesn't work: node "${path.join(dir, "doctor.mjs")}"  (TROUBLESHOOTING.md in the release folder explains each problem)`);
  say(`  That URL works like a password. Anyone who has it can hand your computer work. Don't post it or share it.`);
  if (copied) say(`  After you paste it into Claude, copy something else, so the URL isn't left on your clipboard (or in a clipboard history).`);
}

// ---------- pieces ----------
function slugOf(assistant) {
  const base = assistant.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "assistant";
  return { base, slug: `${base}-handoff`.slice(0, 50) };
}

// The install to update or re-key: the one for --assistant NAME, or the only one in ~/Projects.
function findInstall() {
  const projects = path.join(HOME, "Projects");
  const dirs = val("assistant") ? [path.join(projects, slugOf(clean(val("assistant"))).slug)]
    : (fs.existsSync(projects) ? fs.readdirSync(projects) : []).filter((n) => /-handoff$/.test(n)).map((n) => path.join(projects, n));
  const found = dirs.filter((d) => fs.existsSync(path.join(d, "site.json")));
  if (!found.length) die(`no Nuff Said install found in ${projects}${val("assistant") ? ` for assistant ${val("assistant")}` : ""}. Nothing was changed.`);
  if (found.length > 1) die(`more than one install in ${projects} (${found.map((d) => path.basename(d)).join(", ")}). Pick one with --assistant NAME. Nothing was changed.`);
  const dir = found[0];
  const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")); } catch { return {}; } };
  let toml = ""; try { toml = fs.readFileSync(path.join(dir, "wrangler.toml"), "utf8"); } catch {}
  return { dir, site: read("site.json"), receipt: read("install-receipt.json"), config: read(path.join("worker", "config.json")), toml };
}

// An update keeps what the old install made while it ran: job and thread folders, logs, and settings in worker/config.json.
function carryOver(bak, dir, bell) {
  let moved = 0;
  for (const d of ["jobs", "threads", "logs"]) {
    const from = path.join(bak, d);
    if (!fs.existsSync(from)) continue;
    fs.rmSync(path.join(dir, d), { recursive: true, force: true });
    fs.renameSync(from, path.join(dir, d));
    moved++;
  }
  const cfgPath = path.join(dir, "worker", "config.json"), oldPath = path.join(bak, "worker", "config.json");
  if (fs.existsSync(oldPath)) {
    const fresh = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
    let old = {};
    try { old = JSON.parse(fs.readFileSync(oldPath, "utf8")); } catch { note("couldn't read the old worker/config.json; using the new defaults"); }
    // Your settings win, except the ones this run decides: the command line switch, the bell when it's off, and where the
    // connector is (set after deploy). A bell turned back on gets its setting from your old config if it had one.
    fs.writeFileSync(cfgPath, JSON.stringify({ ...fresh, ...old, powerLanes: fresh.powerLanes, base: fresh.base, bell: bell ? old.bell || fresh.bell : null }, null, 2) + "\n");
  }
  ok(`kept your job and thread folders, logs (${moved} folder(s) moved from the old install) and your worker settings`);
}

function wranglerIn(dir) { return (args, o = {}) => run(HOST === "win32" ? "npx.cmd" : "npx", ["-y", WRANGLER, ...args], { cwd: dir, ...o }); }

// If the connector URL or a key leaked: new connector, worker and lead agent keys, pushed to Cloudflare, then everything saved
// or running that could keep going, so a planted schedule or job doesn't outlive the leak, then the worker and supervisor
// restarted on the new keys.
async function rotateKeys() {
  const { dir, site } = findInstall();
  const ROTATE = has("rotate-keys");
  say(`Nuff Said ${ROTATE ? "key change" : "clear schedules"} ${VERSION} | ${dir}${DRY ? " | DRY RUN: nothing sent to Cloudflare, nothing restarted" : ""}`);
  const W = wranglerIn(dir);
  const db = `${site.slug || path.basename(dir)}-jobs`;
  const STEPS = ROTATE ? 4 : 2;
  const base = JSON.parse(fs.readFileSync(path.join(dir, "worker", "config.json"), "utf8")).base;
  if (!fs.existsSync(path.join(dir, ".connector-url")) || !/^https:\/\//.test(base || "")) {
    die(`${dir} is from an install or update that stopped partway. In the release folder run node install.mjs --update first, then try this again. Nothing was changed.`);
  }
  const oldUrl = fs.readFileSync(path.join(dir, ".connector-url"), "utf8").trim();
  if (!DRY) say("  Getting Cloudflare's command line tool (wrangler). The first time, this download takes a few seconds with no output.");
  if (!DRY) cloudflareSignIn(W, "no keys were changed");
  // The connector key first, so a leaked URL is locked out at once. The worker key last, right before the restart, so the
  // running worker isn't cut off while you read the list below (a job finishing then couldn't report and would run again).
  const newKeys = (keys, first) => {
    for (const [i, [name, file]] of keys.entries()) {
      const key = randomBytes(32).toString("hex");
      // Cloudflare first, then the file: if a step fails, every key file still matches what Cloudflare has.
      if (!DRY) { const r = W(["secret", "put", name], { input: key }); if (r.status !== 0) die(`couldn't store ${name} on Cloudflare: ${tail(r)}. ${i || !first ? "Keys changed before it are saved" : "No keys were changed"}; run --rotate-keys again.`); }
      writeSecret(path.join(dir, file), key);
      ok(`${name} changed${DRY ? " (dry run: only the file)" : ", on Cloudflare and in " + file}`);
    }
  };
  if (ROTATE) {
    step("New connector key", STEPS);
    newKeys([["CONNECTOR_KEY", ".connector-key"]], true);
    writeSecret(path.join(dir, ".connector-url"), `${base}/${fs.readFileSync(path.join(dir, ".connector-key"), "utf8").trim()}/mcp`);
    ok(`new private URL saved in .connector-url; the old URL ${DRY ? "would be locked out (dry run: nothing sent to Cloudflare)" : "is locked out"}`);
  }

  step("What could still run later", STEPS);
  const q = (sql) => {
    if (DRY) return [];
    const r = W(["d1", "execute", db, "--remote", "--json", "--command", sql]);
    try { return JSON.parse(r.stdout)[0].results || []; } catch { die(`couldn't read the database ${db}: ${tail(r)}`); }
  };
  const tag = (x) => x.created_by ? `set up by ${x.created_by}` : "recorded as you";
  const sch = q("SELECT id, name, repeat, at_time, days, next_run_at, created_by FROM schedules WHERE enabled=1 AND kind<>'digest' ORDER BY next_run_at");
  const rts = q("SELECT id, name, steps, created_by FROM routines ORDER BY name_key");
  // Running jobs too: a planted job that's running now would otherwise be put back in the queue by the restart and keep going.
  const waiting = q("SELECT id, title, status, created_by FROM jobs WHERE status IN ('running','queued','needs_approval') ORDER BY created_at");
  if (DRY) skip("reading schedules, routines and running and waiting jobs from Cloudflare (dry run)");
  say(sch.length ? `  Schedules (${sch.length}):` : "  No schedules.");
  for (const x of sch) say(`    - "${x.name}" (${x.id}): ${x.repeat} at ${x.at_time}${x.days ? ` on ${x.days}` : ""}, next ${x.next_run_at}; ${tag(x)}`);
  say(rts.length ? `  Routines (${rts.length}):` : "  No routines.");
  for (const x of rts) { let n = "?"; try { n = JSON.parse(x.steps).length; } catch {} say(`    - "${x.name}" (${x.id}), ${n} step(s); ${tag(x)}`); }
  say(waiting.length ? `  Running and waiting jobs (${waiting.length}):` : "  No running jobs, queued jobs or jobs waiting for your yes.");
  for (const x of waiting) say(`    - "${x.title}" (${x.id}), ${x.status}; ${tag(x)}`);
  say("  Anyone with your old URL could have saved these through Claude, and then they show as \"recorded as you\". Check every one.");

  step("Clear them", STEPS);
  const total = sch.length + rts.length + waiting.length;
  let clear = has("clear-schedules");
  if (!clear && total) {
    const ask = await asker();
    clear = /^y(es)?$/i.test(await ask("Turn off every schedule, delete every routine and stop or cancel every job above? You can set your own up again.", "no"));
    ask.close();
  }
  if (DRY) skip("clearing (dry run)");
  else if (!total) ok("nothing to clear");
  else if (!clear) say("  Kept them. To clear them later: node install.mjs --clear-schedules. Or cancel the ones you don't know in Claude (cancel_schedule, delete_routine, cancel_job).");
  else {
    const now = new Date().toISOString();
    q(`UPDATE schedules SET enabled=0, next_run_at=NULL, last_note='Turned off by a key change.', updated_at='${now}' WHERE enabled=1 AND kind<>'digest'`);
    q("DELETE FROM routines");
    // Running jobs are stopped the way cancel_job stops them: the supervisor kills them, and the worker's restart cancels them
    // instead of putting them back in the queue.
    q(`INSERT INTO control (kind, job_id, created_at) SELECT 'stop', id, '${now}' FROM jobs WHERE status='running' AND cancel_requested=0`);
    q(`UPDATE jobs SET cancel_requested=1, cancel_at=COALESCE(cancel_at, '${now}'), updated_at='${now}' WHERE status='running'`);
    q(`UPDATE jobs SET status='cancelled', result='Cancelled by a key change. Nothing it was waiting to do was done.', finished_at='${now}', updated_at='${now}', reported_at='${now}' WHERE status IN ('queued','needs_approval')`);
    const run = waiting.filter((x) => x.status === "running").length;
    ok(`turned off ${sch.length} schedule(s), deleted ${rts.length} routine(s), stopped ${run} running job(s), cancelled ${waiting.length - run} waiting job(s)`);
  }

  // The restart comes after clearing, so a running job you chose to stop is cancelled by it, not put back in the queue.
  if (ROTATE) {
    step("New worker key and restart", STEPS);
    newKeys([["WORKER_KEY", ".worker-key"], ...(fs.existsSync(path.join(dir, ".lead-agent-key")) ? [["LEAD_AGENT_KEY", ".lead-agent-key"]] : [])], false);
    note("the bell key (.bell-key) only works from this computer, so it stays");
    if (MAC && !DRY && !SIM && !has("no-start")) {
      for (const label of ["com.daisy.handoff-worker", "com.daisy.supervisor"]) {
        const r = run("launchctl", ["kickstart", "-k", `gui/${process.getuid()}/${label}`]);
        (r.status === 0 ? ok : note)(r.status === 0 ? `restarted ${label} on the new key` : `couldn't restart ${label} (${tail(r)}); log out and back in to restart it`);
      }
      note(clear ? "jobs you chose to stop are cancelled, not started again" : "jobs that were running go back in the queue and start again");
    } else if (!MAC && !DRY) note("restart the worker so it uses the new key: sign out of Windows and back in");
    else skip(`restarting the worker and supervisor (${DRY ? "dry run" : "--no-start"})`);
    if (!DRY) {
      const s = await smokeCheck(fs.readFileSync(path.join(dir, ".connector-url"), "utf8").trim());
      (s.ok ? ok : note)(s.ok ? `the new URL answers (${s.tools} tools)` : `the new URL didn't answer yet (${s.why})`);
      let gone = 0;
      for (let i = 0; i < 6 && gone !== 404; i++) { try { gone = (await fetch(oldUrl, { method: "POST", body: "{}" })).status; } catch {} if (gone !== 404) await new Promise((r) => setTimeout(r, 5000)); }
      (gone === 404 ? ok : note)(gone === 404 ? "the old URL is turned away (HTTP 404)" : `the old URL still answered HTTP ${gone}; check again in a minute`);
    }
  }

  if (ROTATE) {
    say("\n  Next:");
    say("  1. In Claude, remove the old connector under Customize > Connectors and add it again with the new URL" +
      (DRY || SIM ? " (in .connector-url)." : `${copyUrl(dir) ? " (it's on your clipboard; copy something else afterwards)." : " (in .connector-url)."}`));
    say("  2. If the URL was out while the command line was on, assume someone could have run commands as you. Read");
    say(`     ${path.join(dir, "logs", "shell.log")} for commands you didn't run, and check \`crontab -l\` and ~/Library/LaunchAgents`);
    say("     for anything you don't recognize. If you find any, treat this computer as compromised.");
  }
  say(`\n${DRY ? "DRY RUN COMPLETE" : "DONE"}  (${dir})`);
}

function copyUrl(dir) {
  const u = fs.readFileSync(path.join(dir, ".connector-url"), "utf8");
  return (HOST === "darwin" ? run("pbcopy", [], { input: u, shell: false }) : run("clip", [], { input: u })).status === 0;
}

function findClaude() {
  const exe = WIN ? "claude.exe" : "claude";
  const spots = [path.join(HOME, ".local", "bin", exe)];
  if (!SIM) spots.push(path.join(os.homedir(), ".local", "bin", exe));
  for (const p of spots) if (fs.existsSync(p)) return p;
  if (SIM) return spots[0]; // other OS: assume the standard install spot
  return which("claude");
}

// --yes takes every default and prints it, so the log shows what was decided. With no terminal and no --yes, nothing is
// answered silently: it stops at the first question instead.
async function asker() {
  if (has("yes")) { const f = async (q, d) => { say(`  ${q} [${d}]: ${d} (--yes)`); return d; }; f.close = () => {}; return f; }
  if (!process.stdin.isTTY) {
    const f = async (q) => die(`no terminal to ask in ("${q.split("?")[0]}?"). Run it in Terminal, or add --yes to take the defaults ` +
      "(command line and desktop control on, phone notifications off). Nothing was changed.");
    f.close = () => {}; return f;
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const f = async (q, d) => (await rl.question(`  ${q} [${d}]: `)).trim() || d;
  f.close = () => rl.close();
  return f;
}

function clean(s) {
  s = String(s).replace(/[{}<>"'`$\\]/g, "").trim().slice(0, 40);
  if (!s) die("a name can't be empty");
  return s;
}

function workerConfig(home, claudeBin, slug, power, bell = false) {
  const cfg = {
    base: "set-after-deploy",
    workerTag: slug, // unique per install, so one install's cleanup can never end another install's jobs
    aliveFile: "logs/.worker-alive",
    keyFile: ".worker-key",
    claudeBin: fwd(claudeBin || `${home}/.local/bin/claude${WIN ? ".exe" : ""}`),
    pollSeconds: 20,
    runawayHours: 24,
    bell: bell ? { url: "http://127.0.0.1:8790/notify", keyFile: ".bell-key" } : null, // null: --no-bell
    addDirs: [home],
    maxParallel: 3,
    powerLanes: power, // shell commands and desktop control; the connector's POWER_LANES var matches it
    host: MAC
      ? { driverBin: "/Applications/CuaDriver.app/Contents/MacOS/cua-driver", idleSeconds: 10, overlay: true }
      : { driverBin: "", idleSeconds: 10, overlay: false },
  };
  if (WIN) cfg.screen = { displays: 1, captureBin: "" };
  return cfg;
}

function render(src, out, tokens) {
  const MAY_BE_EMPTY = new Set(["LEAD_AGENT"]); // "" means off
  for (const [k, v] of Object.entries(tokens)) if (typeof v !== "string" || (!v && !MAY_BE_EMPTY.has(k))) die(`internal: token ${k} has no value`);
  const left = [];
  let n = 0;
  const walk = (d) => {
    for (const name of fs.readdirSync(d)) {
      if (name === "__pycache__" || name === ".DS_Store") continue;
      const s = path.join(d, name);
      const rel = path.relative(src, s);
      const dst = path.join(out, rel);
      if (fs.statSync(s).isDirectory()) { walk(s); continue; }
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      const buf = fs.readFileSync(s);
      if (/(^|[\\/])vendor[\\/]/.test(rel) || buf.includes(0)) { fs.copyFileSync(s, dst); n++; continue; } // bundles and binaries: copy as is
      const text = buf.toString("utf8").replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => (k in tokens ? tokens[k] : (left.push(`${rel}: ${m}`), m)));
      fs.writeFileSync(dst, text);
      try { fs.chmodSync(dst, fs.statSync(s).mode & 0o777); } catch {}
      n++;
    }
  };
  walk(src);
  if (left.length) die(`the template has placeholders this installer doesn't know (a bug; nothing was deployed):\n${left.join("\n")}`);
  return n;
}

function setWorkerBase(dir, url) {
  const p = path.join(dir, "worker", "config.json");
  if (!fs.existsSync(p)) return note("no worker/config.json found to point at the connector");
  const c = JSON.parse(fs.readFileSync(p, "utf8"));
  c.base = url;
  fs.writeFileSync(p, JSON.stringify(c, null, 2) + "\n");
}

// Signed in to Cloudflare, or the browser sign-in first. Stops with `stopped` (what was left alone) if it doesn't finish.
function cloudflareSignIn(W, stopped) {
  const who = W(["whoami"]);
  if (who.status !== 0 || /not authenticated|not logged in/i.test(`${who.stdout}${who.stderr}`)) {
    say("  Your browser will open. Sign in to Cloudflare (a free account works) and click Allow.");
    const again = W(["login"], { stdio: "inherit" }).status === 0 && W(["whoami"]);
    if (!again || again.status !== 0 || /not authenticated|not logged in/i.test(`${again.stdout}${again.stderr}`)) die(`Cloudflare sign-in didn't finish. Run this again when you're ready; ${stopped}.`);
  }
  ok("signed in to Cloudflare");
}

function deploy(dir, slug, lead, dropLead) {
  const npx = HOST === "win32" ? "npx.cmd" : "npx";
  const W = (args, o = {}) => run(npx, ["-y", WRANGLER, ...args], { cwd: dir, ...o });
  say("  Getting Cloudflare's command line tool (wrangler). The first time, this download takes a few seconds with no output.");
  cloudflareSignIn(W, "nothing was deployed");
  const db = `${slug}-jobs`;
  const find = () => { const r = W(["d1", "list", "--json"]); try { return (JSON.parse(r.stdout).find((d) => d.name === db) || {}).uuid; } catch { return undefined; } };
  let id = find();
  if (!id) { W(["d1", "create", db]); id = find(); }
  if (!id) die(`couldn't create the database ${db}. Check with: npx -y ${WRANGLER} d1 list`);
  const toml = path.join(dir, "wrangler.toml");
  fs.writeFileSync(toml, fs.readFileSync(toml, "utf8").replace(/database_id = "[^"]*"( #.*)?/, `database_id = "${id}"`));
  ok(`database ${db}`);
  const ex = W(["d1", "execute", db, "--remote", "--file", "schema.sql", "-y"]);
  if (ex.status !== 0) die(`couldn't create the job table: ${tail(ex)}`);
  // Columns added after a release: a fresh table already has them, an older one gets them here.
  for (const sql of UPGRADES) {
    const r = W(["d1", "execute", db, "--remote", "--command", sql, "-y"]);
    if (r.status !== 0 && !/duplicate column/i.test(`${r.stdout}${r.stderr}`)) die(`couldn't update the job table: ${tail(r)}`);
  }
  ok("job table");
  const dep = W(["deploy"]);
  const out = `${dep.stdout}${dep.stderr}`;
  const url = (out.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/) || [])[0];
  if (dep.status !== 0 || !url) {
    if (/subdomain/i.test(out)) die("your Cloudflare account needs a workers.dev subdomain first. Open dash.cloudflare.com > Workers & Pages, pick a subdomain, then run this again.");
    die(`deploy failed: ${tail(dep)}`);
  }
  ok("connector deployed");
  if (stillOld) stillOld = "Your connector on Cloudflare has the new settings, but the running worker still uses the old ones, including the command line switch, until the update finishes. Run node install.mjs --update again.";
  for (const [name, file] of [["CONNECTOR_KEY", ".connector-key"], ["WORKER_KEY", ".worker-key"], ...(lead ? [["LEAD_AGENT_KEY", ".lead-agent-key"]] : [])]) {
    const r = W(["secret", "put", name], { input: fs.readFileSync(path.join(dir, file), "utf8") });
    if (r.status !== 0) die(`couldn't store ${name} on Cloudflare: ${tail(r)}`);
  }
  ok("keys stored on Cloudflare");
  if (dropLead) {
    const r = W(["secret", "delete", "LEAD_AGENT_KEY"], { input: "y\n" });
    (r.status === 0 ? ok : note)(r.status === 0 ? "lead agent key removed from Cloudflare" : `lead agent is off (LEAD_AGENT is empty), but its key couldn't be removed from Cloudflare (${tail(r)})`);
  }
  return url;
}

// The phone bell is an always-on Claude Code session in jarvis-bell/. Claude Code asks whether to trust a new folder
// before it starts, and nobody is at that terminal to answer, so the installer records the yes, as answering it would.
function trustBellFolder(dir) {
  if (DRY || SIM) return skip("Claude Code's trust for the bell folder (dry run)");
  const p = path.join(HOME, ".claude.json");
  try {
    const c = JSON.parse(fs.readFileSync(p, "utf8"));
    const key = path.join(dir, "jarvis-bell");
    c.projects = c.projects || {};
    c.projects[key] = { ...(c.projects[key] || {}), hasTrustDialogAccepted: true };
    const tmp = `${p}.handoff-${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(c, null, 2), { mode: fs.statSync(p).mode & 0o777 });
    fs.renameSync(tmp, p);
    ok("Claude Code trusts the bell folder, so the phone bell can start");
  } catch (e) {
    note(`couldn't mark the bell folder as trusted in ~/.claude.json (${e.message}); phone notifications won't start until it is. Run doctor.mjs for the fix.`);
  }
}

function installMac(dir, bell = false) {
  const agents = path.join(HOME, "Library", "LaunchAgents");
  fs.mkdirSync(agents, { recursive: true });
  const BELL_PLIST = "com.daisy.jarvis-bell.plist";
  const plists = fs.readdirSync(path.join(dir, "worker")).filter((f) => /^com\.daisy\..*\.plist$/.test(f) && (bell || f !== BELL_PLIST));
  // Bell turned off: stop it and move its startup entry aside, the way --uninstall does.
  if (!bell && fs.existsSync(path.join(agents, BELL_PLIST))) {
    if (!DRY && !SIM) run("launchctl", ["bootout", `gui/${process.getuid()}`, path.join(agents, BELL_PLIST)]);
    const aside = path.join(HOME, ".handoff-uninstalled", stamp());
    fs.mkdirSync(aside, { recursive: true });
    fs.renameSync(path.join(agents, BELL_PLIST), path.join(aside, BELL_PLIST));
    ok(`${DRY ? "phone bell would stop (dry run)" : "phone bell stopped"}; its startup entry moved to ${aside}`);
  }
  if (!plists.length) die("no launch agents in the template (a bug)");
  for (const f of plists) {
    const dst = path.join(agents, f);
    fs.copyFileSync(path.join(dir, "worker", f), dst);
    if (HOST === "darwin") { const l = run("plutil", ["-lint", dst]); if (l.status !== 0) die(`${f} isn't a valid launch agent: ${tail(l)}`); }
    if (DRY || SIM || has("no-start")) continue;
    const uid = String(process.getuid());
    run("launchctl", ["bootout", `gui/${uid}`, dst]);
    const b = run("launchctl", ["bootstrap", `gui/${uid}`, dst]);
    if (b.status !== 0) die(`couldn't start ${f}: ${tail(b)}`);
    ok(`started ${f.replace(/\.plist$/, "")}`);
  }
  if (DRY || SIM || has("no-start")) skip(`${plists.length} launch agents written to ${agents}${HOST === "darwin" ? " and checked with plutil" : ""}; not started (${DRY ? "dry run" : "--no-start"})`);
}

function installWin(dir, assistant) {
  const nodeExe = (!SIM && which("node")) || (SIM ? "C:/Program Files/nodejs/node.exe" : process.execPath);
  const title = `${assistant} Handoff`;
  const runner = path.join(dir, "run-worker.cmd");
  fs.writeFileSync(runner, [
    "@echo off",
    `rem ${title} worker: restarts itself 30 seconds after any exit. Log: logs\\worker.log`,
    `title ${title}`,
    `cd /d "${bk(dir)}"`,
    ":loop",
    `"${bk(nodeExe)}" "worker\\worker.mjs" >> "logs\\worker.log" 2>&1`,
    "timeout /t 30 /nobreak >nul",
    "goto loop",
    "",
  ].join("\r\n"));
  const startup = path.join(HOME, "AppData", "Roaming", "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
  fs.mkdirSync(startup, { recursive: true });
  const launcher = path.join(startup, `${title}.cmd`);
  fs.writeFileSync(launcher, ["@echo off", `start "${title}" /min "${bk(runner)}"`, ""].join("\r\n"));
  if (DRY || SIM || has("no-start")) return skip(`login launcher written to ${launcher}; not started (${DRY ? "dry run" : "--no-start"})`);
  run("cmd", ["/c", "start", `"${title}"`, "/min", `"${bk(runner)}"`]);
  ok(`started; it also starts at every login (${launcher})`);
}

async function smokeCheck(full) {
  const H = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
  const post = async (u, body) => { const r = await fetch(u, { method: "POST", headers: H, body: JSON.stringify(body) }); return { status: r.status, text: await r.text() }; };
  const parse = (t) => { try { return JSON.parse(t); } catch { const m = t.match(/^data: (.*)$/m); try { return m ? JSON.parse(m[1]) : null; } catch { return null; } } };
  let why = "no answer";
  for (let i = 0; i < 8; i++) { // new secrets can take a few seconds to reach Cloudflare's edge
    try {
      const init = await post(full, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "installer", version: VERSION } } });
      if (init.status === 200) {
        const tools = parse((await post(full, { jsonrpc: "2.0", id: 2, method: "tools/list" })).text)?.result?.tools?.length || 0;
        const bad = await post(full.replace(/\/[0-9a-f]{64}\/mcp$/, "/wrongkey/mcp"), {});
        if (tools > 0 && bad.status !== 200) return { ok: true, tools, badStatus: bad.status };
        why = `tools ${tools}, wrong key got HTTP ${bad.status}`;
      } else why = `HTTP ${init.status}`;
    } catch (e) { why = e.message; }
    await new Promise((r) => setTimeout(r, 5000));
  }
  return { ok: false, why };
}
