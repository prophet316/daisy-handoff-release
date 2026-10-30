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
check(cfg.powerLanes === (power === "on"), `worker config has command line and desktop control ${power} (powerLanes: ${cfg.powerLanes})`);

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

// 7. receipt
const r = JSON.parse(fs.readFileSync(path.join(dir, "install-receipt.json"), "utf8"));
check(r.dryRun === true && r.platform === platform, "install receipt records a dry run for this platform");
check(!JSON.stringify(r).includes(keys[0]), "receipt contains no key");
check(r.powerLanes === (power === "on"), `install receipt records command line and desktop control ${power}`);

console.log(fails ? `\n${fails} check(s) failed` : "\nALL CHECKS PASSED");
process.exit(fails ? 1 : 0);
