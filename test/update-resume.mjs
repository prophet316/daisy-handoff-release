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
const check = (ok, s) => { console.log(`${ok ? "PASS" : "FAIL"}  ${s}`); if (!ok) fail++; };
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

// An install with no receipt and no answer in its worker config: the update asks for a flag instead of turning things on.
fs.rmSync(path.join(dir, "install-receipt.json"));
const cfgPath = path.join(dir, "worker", "config.json"), cfg = json(path.join("worker", "config.json"));
delete cfg.powerLanes; fs.writeFileSync(cfgPath, JSON.stringify(cfg));
r = install(["--dry-run", "--update"]);
check(r.status !== 0 && /--no-power-lanes or --power-lanes/.test(r.stderr), "with no answer on record, the update stops and asks for a flag");

fs.rmSync(home, { recursive: true, force: true });
console.log(fail ? `update resume: ${fail} FAILED` : "update resume: all checks passed");
process.exit(fail ? 1 : 0);
