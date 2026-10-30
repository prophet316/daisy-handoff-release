// Checks a dry-run install made by install.mjs. Exits non-zero on the first real problem.
// Usage: node test/verify-dry-run.mjs <home> <slug> <darwin|win32> [on|off]   (the last: the expected power lanes; default on)
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const [home, slug = "daisy-handoff", platform = process.platform, power = "on"] = process.argv.slice(2);
if (!home || !["off", "on"].includes(power)) { console.error("usage: node test/verify-dry-run.mjs <home> <slug> <darwin|win32> [on|off]"); process.exit(2); }
const dir = path.join(home, "Projects", slug);
let fails = 0;
const pass = (s) => console.log(`PASS  ${s}`);
const fail = (s) => { console.log(`FAIL  ${s}`); fails++; };
const check = (cond, s) => (cond ? pass(s) : fail(s));

check(fs.existsSync(dir), `install folder exists (${dir})`);

// 1. no placeholder left anywhere
const left = [];
const mjs = [];
const walk = (d) => { for (const n of fs.readdirSync(d)) { const p = path.join(d, n); if (fs.statSync(p).isDirectory()) { if (n !== "vendor") walk(p); continue; } const b = fs.readFileSync(p); if (b.includes(0)) continue; if (/\{\{[A-Z_]+\}\}/.test(b.toString("utf8"))) left.push(path.relative(dir, p)); if (/\.(mjs|js)$/.test(n)) mjs.push(p); } };
walk(dir);
check(left.length === 0, `no unfilled placeholders${left.length ? `: ${left.join(", ")}` : ""}`);

// 2. every rendered script still parses (catches path escaping bugs, e.g. Windows backslashes inside strings)
const bad = mjs.filter((p) => spawnSync(process.execPath, ["--check", p], { encoding: "utf8" }).status !== 0);
check(bad.length === 0, `${mjs.length} rendered JS files pass node --check${bad.length ? `; broken: ${bad.map((p) => path.relative(dir, p)).join(", ")}` : ""}`);

// 3. keys and private URL
for (const k of [".connector-key", ".worker-key", ".bell-key"]) {
  const p = path.join(dir, k);
  const ok = fs.existsSync(p) && /^[0-9a-f]{64}$/.test(fs.readFileSync(p, "utf8"));
  check(ok, `${k} is a fresh 64-character key`);
  if (ok && process.platform !== "win32") check((fs.statSync(p).mode & 0o077) === 0, `${k} is readable only by its owner`);
}
const keys = [".connector-key", ".worker-key", ".bell-key"].map((k) => fs.readFileSync(path.join(dir, k), "utf8"));
check(new Set(keys).size === 3, "the three keys are all different");
const url = fs.readFileSync(path.join(dir, ".connector-url"), "utf8");
check(url === `https://${slug}.your-subdomain.workers.dev/${keys[0]}/mcp`, ".connector-url has the expected shape");

// 4. worker config
const cfg = JSON.parse(fs.readFileSync(path.join(dir, "worker", "config.json"), "utf8"));
check(cfg.base === `https://${slug}.your-subdomain.workers.dev`, "worker config points at the connector");
check(platform === "win32" ? /claude\.exe$/.test(cfg.claudeBin) : /\/claude$/.test(cfg.claudeBin), `worker config has the ${platform} Claude Code path (${cfg.claudeBin})`);
check(!/\\/.test(JSON.stringify(cfg)), "worker config uses forward slashes only");
check(cfg.workerTag === slug && cfg.workerTag !== "live", `worker tag is unique to this install (${cfg.workerTag})`);
const leadToml = fs.readFileSync(path.join(dir, "wrangler.toml"), "utf8");
const leadKey = fs.existsSync(path.join(dir, ".lead-agent-key"));
check(/^LEAD_AGENT = ""$/m.test(leadToml) && !leadKey, "only the owner can approve held actions (lead agent off, no lead key)");
check(/^ALTER TABLE jobs ADD COLUMN created_by TEXT;?$/m.test(fs.readFileSync(path.join(dir, "migrations", "012_sender.sql"), "utf8")) &&
  /sender TEXT/.test(fs.readFileSync(path.join(dir, "schema.sql"), "utf8")), "the job table records who sent each message");
const schemaSql = fs.readFileSync(path.join(dir, "schema.sql"), "utf8");
check(/^ALTER TABLE schedules ADD COLUMN created_by TEXT;$/m.test(fs.readFileSync(path.join(dir, "migrations", "013_sender_schedules.sql"), "utf8")) &&
  (schemaSql.match(/created_by TEXT/g) || []).length === 3, "schedules and routines record who saved them");
check(fs.existsSync(path.join(dir, "test", "sender.mjs")), "the who-sent-it test ships with the install");
const workerSrc = fs.readFileSync(path.join(dir, "worker", "worker.mjs"), "utf8");
check(/ENABLE_CLAUDEAI_MCP_SERVERS: "false"/.test(workerSrc), "a job's own Claude sessions don't load the connectors in your Claude account");
check(/"Bash\(cua-driver:\*\)"/.test(workerSrc) && /"Bash\(composio:\*\)"/.test(workerSrc), "jobs are denied the usual cua-driver and composio commands");
check(cfg.powerLanes === (power === "on"), `worker config has command line and desktop control ${power} (powerLanes: ${cfg.powerLanes})`);
if (platform === "darwin") {
  const site = JSON.parse(fs.readFileSync(path.join(dir, "site.json"), "utf8"));
  check(cfg.host?.overlay === true && cfg.host?.overlayBin === `${home}/${site.dotdir}/overlay/DaisyOverlay.app/Contents/MacOS/DaisyOverlay`, `worker config points the host lane at the glow helper the installer builds (${cfg.host?.overlayBin})`);
}

// 5. wrangler.toml
const toml = fs.readFileSync(path.join(dir, "wrangler.toml"), "utf8");
check(new RegExp(`^name = "${slug}"$`, "m").test(toml), "wrangler.toml names this install's own Worker");
check(new RegExp(`^POWER_LANES = "${power}"$`, "m").test(toml), `wrangler.toml has POWER_LANES = "${power}"`);

// 6. startup entry for the OS
if (platform === "darwin") {
  const agents = path.join(home, "Library", "LaunchAgents");
  const plists = fs.existsSync(agents) ? fs.readdirSync(agents).filter((f) => f.endsWith(".plist")) : [];
  check(plists.length >= 2, `launch agents written (${plists.join(", ")})`);
  if (process.platform === "darwin") for (const f of plists) check(spawnSync("plutil", ["-lint", path.join(agents, f)]).status === 0, `${f} passes plutil -lint`);
  // The phone bell is off unless the person said yes: no bell session and no bell settings without a yes on record.
  const bellOn = JSON.parse(fs.readFileSync(path.join(dir, "install-receipt.json"), "utf8")).bell === true;
  check(plists.includes("com.daisy.jarvis-bell.plist") === bellOn && (cfg.bell === null) === !bellOn, `phone bell ${bellOn ? "on, as the install said yes" : "off, as no yes is on record"}`);
  const nodeLink = fs.readdirSync(home, { withFileTypes: true }).filter((e) => e.name.startsWith(".") && fs.existsSync(path.join(home, e.name, "node", "bin", "node")));
  check(nodeLink.length === 1, "worker Node link exists");
} else {
  const startup = path.join(home, "AppData", "Roaming", "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
  const launchers = fs.existsSync(startup) ? fs.readdirSync(startup).filter((f) => f.endsWith(" Handoff.cmd")) : [];
  check(launchers.length === 1, `login launcher written (${launchers.join(", ")})`);
  const runner = path.join(dir, "run-worker.cmd");
  check(fs.existsSync(runner) && /node(\.exe)?" "worker\\worker\.mjs"/.test(fs.readFileSync(runner, "utf8")), "run-worker.cmd starts worker.mjs with node");
  check(fs.existsSync(runner) && fs.readFileSync(runner, "utf8").includes("\r\n"), "run-worker.cmd has Windows line endings");
}

// 7. time zone: the owner's own, the same in site.json, the connector and the receipt
const site = JSON.parse(fs.readFileSync(path.join(dir, "site.json"), "utf8"));
let zoneOk = false;
try { new Intl.DateTimeFormat("en-US", { timeZone: site.timeZone }); zoneOk = !!site.timeZone; } catch {}
check(zoneOk, `site.json has a real time zone (${site.timeZone})`);
const want = process.env.EXPECT_TIME_ZONE || Intl.DateTimeFormat().resolvedOptions().timeZone;
check(site.timeZone === want, `time zone is ${want}${process.env.EXPECT_TIME_ZONE ? " (--time-zone)" : " (this computer's own)"}`);
const src = fs.readFileSync(path.join(dir, "src", "index.js"), "utf8");
check(src.includes(`const TZ = "${site.timeZone}";`) && !/America\/Chicago|Central Time/.test(src.split(site.timeZone).join("")), "the connector uses that zone and nothing is fixed to Central Time");

// 8. doctor: copied into the install, runs, and its report holds no key or connector URL
const doc = path.join(dir, "doctor.mjs");
check(fs.existsSync(doc), "doctor.mjs is in the install folder");
if (fs.existsSync(doc)) {
  const before = new Set(fs.readdirSync(path.join(dir, "logs")));
  const d = spawnSync(process.execPath, [doc, "--dir", dir, "--offline"], { encoding: "utf8", timeout: 60000 });
  check(d.status === 0 || d.status === 1, `doctor runs and finishes (exit ${d.status})`);
  const made = fs.readdirSync(path.join(dir, "logs")).filter((f) => !before.has(f) && f.startsWith("doctor-report-"));
  const rep = made.length ? fs.readFileSync(path.join(dir, "logs", made[0]), "utf8") : "";
  check(made.length === 1 && rep.includes("Your install"), "doctor saved a report in logs/");
  check(rep && !keys.some((k) => rep.includes(k)) && !rep.includes(url) && !(d.stdout || "").includes(keys[0]), "doctor's report and screen show no key and no connector URL");
  for (const f of made) fs.rmSync(path.join(dir, "logs", f));
}

// 9. receipt
const r = JSON.parse(fs.readFileSync(path.join(dir, "install-receipt.json"), "utf8"));
check(r.dryRun === true && r.platform === platform, "install receipt records a dry run for this platform");
check(!JSON.stringify(r).includes(keys[0]), "receipt contains no key");
check(r.powerLanes === (power === "on"), `install receipt records command line and desktop control ${power}`);
check(r.timeZone === site.timeZone, "install receipt records the time zone");

console.log(fails ? `\n${fails} check(s) failed` : "\nALL CHECKS PASSED");
process.exit(fails ? 1 : 0);
