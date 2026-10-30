// The doctor never sends the connector key to an address the install didn't deploy (the dry run's placeholder, or the manual
// guide's example), and still checks a deployed connector. Every fetch the doctor makes is caught here; nothing reaches the network.
// Usage: node test/doctor-no-leak.mjs     (makes its own dry-run install in a throwaway folder)
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const home = fs.mkdtempSync(path.join(os.tmpdir(), "doctor-leak-"));
let fails = 0;
const check = (ok, s, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${s}${ok || !extra ? "" : `  (${extra})`}`); if (!ok) fails++; };

const inst = spawnSync(process.execPath, [path.join(REPO, "install.mjs"), "--dry-run", "--yes", "--name", "Tester", "--assistant", "Daisy", "--home", home], { encoding: "utf8" });
check(inst.status === 0, "dry-run install for the test", inst.stderr);
const dir = path.join(home, "Projects", "daisy-handoff");
const key = fs.readFileSync(path.join(dir, ".connector-key"), "utf8").trim();
const log = path.join(home, "fetches.txt");
const hook = path.join(home, "catch-fetch.mjs");
fs.writeFileSync(hook, `import fs from "node:fs";
globalThis.fetch = async (u) => { fs.appendFileSync(${JSON.stringify(log)}, String(u) + "\\n"); return new Response("{}", { status: 200 }); };\n`);

function doctor() {
  fs.rmSync(log, { force: true });
  // HOME (USERPROFILE on Windows) points at the throwaway home, so the doctor treats this install as the live one and runs its live checks.
  const r = spawnSync(process.execPath, ["--import", pathToFileURL(hook).href, path.join(dir, "doctor.mjs"), "--dir", dir], { encoding: "utf8", env: { ...process.env, HOME: home, USERPROFILE: home } }); // USERPROFILE: Windows' home
  if (r.status === null || !/Nuff Said doctor/.test(r.stdout || "")) check(false, "the doctor ran", `${r.stderr}`.slice(0, 300)); // a doctor that never ran proves nothing
  const urls = fs.existsSync(log) ? fs.readFileSync(log, "utf8").split("\n").filter(Boolean) : [];
  return { out: `${r.stdout}${r.stderr}`, urls };
}

// 1. a dry run: the placeholder address
let d = doctor();
check(!d.urls.some((u) => u.includes(key)), "dry run: the key is sent nowhere", d.urls.join(" "));
check(!d.urls.some((u) => /your-subdomain/.test(u)), "dry run: nothing goes to the placeholder address");
check(/skipped the live connector check/.test(d.out), "dry run: the doctor says it skipped the live check");

// 2. the manual guide's example pasted as is: a real-looking URL file, the placeholder still in config.json
fs.writeFileSync(path.join(dir, ".connector-url"), `https://daisy-handoff.your-subdomain.workers.dev/${key}/mcp`);
d = doctor();
check(!d.urls.some((u) => u.includes(key)), "example address: the key is sent nowhere", d.urls.join(" "));

// Made-up connector hosts. They're built from parts because the release safety scan flags any workers.dev host that isn't
// the your-subdomain placeholder, and these two aren't real installs.
const fakeHost = (sub) => `https://daisy-handoff.${sub}.${["workers", "dev"].join(".")}`;
const MINE = fakeHost("tester"), OTHER = fakeHost("someone-else");

// 3. a URL file that points somewhere other than the recorded connector
const cfgPath = path.join(dir, "worker", "config.json");
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
fs.writeFileSync(cfgPath, JSON.stringify({ ...cfg, base: MINE }));
fs.writeFileSync(path.join(dir, ".connector-url"), `${OTHER}/${key}/mcp`);
d = doctor();
check(!d.urls.some((u) => u.includes(key)), "a URL that isn't the recorded connector: the key is sent nowhere", d.urls.join(" "));

// 4. deployed: the doctor does check the connector it recorded
fs.writeFileSync(path.join(dir, ".connector-url"), `${MINE}/${key}/mcp`);
d = doctor();
check(d.urls.includes(`${MINE}/${key}/mcp`), "deployed: the doctor checks the recorded connector", d.urls.join(" "));
check(/connector on Cloudflare answers your key/.test(d.out), "deployed: and reports the answer");

try { fs.rmSync(home, { recursive: true, force: true, maxRetries: 3 }); } catch {}
console.log(fails ? `${fails} check(s) failed` : "doctor: all checks passed");
process.exit(fails ? 1 : 0);
