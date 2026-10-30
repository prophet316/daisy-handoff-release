// The blue glow and the assistant's cursor: on a Mac with the command line and desktop control on, the installer builds the
// overlay helper with the Command Line Tools, for this Mac's chip, where the worker config says, and the worker hands that path
// to the host lane as HOST_OVERLAY_BIN. When the tools are missing or the build fails, the install still finishes and says so.
// Offline: dry runs in throwaway homes (--build-overlay makes a dry run build it). Mac only.
// Usage: node test/overlay-build.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
let fail = 0;
const check = (ok, s, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${s}${ok || !extra ? "" : `  (${String(extra).slice(-400)})`}`); if (!ok) fail++; };
// The installer and the doctor fold long lines for an 80-column Terminal (continuations indented 8 to 11 spaces): read them as one line.
const unfold = (s) => String(s ?? "").replace(/\n {8,11}(?=\S)/g, " ");
if (process.platform !== "darwin") { console.log("overlay build: Mac only, skipped"); process.exit(0); }
if (spawnSync("xcrun", ["--find", "swiftc"], { stdio: "ignore" }).status !== 0) {
  console.log("overlay build: skipped, Apple's Command Line Tools are missing (install them with xcode-select --install, then run this again)"); process.exit(0);
}
const homes = [];
const install = (args, env = {}) => {
  const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "overlay-build-"))); homes.push(home);
  const r = spawnSync(process.execPath, [path.join(REPO, "install.mjs"), "--dry-run", "--yes", "--name", "Tester", "--assistant", "Daisy", ...args, "--home", home], { encoding: "utf8", env: { ...process.env, ...env } });
  return { r, home, dir: path.join(home, "Projects", "daisy-handoff") };
};
const bin = (home) => path.join(home, ".daisy", "overlay", "DaisyOverlay.app", "Contents", "MacOS", "DaisyOverlay");

const doctor = (home) => unfold(spawnSync(process.execPath, [path.join(home, "Projects", "daisy-handoff", "doctor.mjs"), "--offline"], { encoding: "utf8", env: { ...process.env, HOME: home } }).stdout)

// 1. A plain dry run doesn't build (it changes nothing on the Mac), and says so; the doctor then says it isn't built.
let { r, home } = install([]);
check(r.status === 0 && /skip\s+building the blue glow/.test(r.stdout) && !fs.existsSync(bin(home)), "a plain dry run skips the build and says so", r.stdout);
let doc = doctor(home);
check(/blue glow and Daisy cursor helper isn't built/.test(doc) && /build\.sh/.test(doc), "the doctor says the glow helper isn't built and how to build it", doc);

// 2. With the tools, it builds for this Mac's chip, where the worker config points.
({ r, home } = install(["--build-overlay"]));
const cfg = JSON.parse(fs.readFileSync(path.join(home, "Projects", "daisy-handoff", "worker", "config.json"), "utf8"));
check(r.status === 0 && /ok\s+blue glow and cursor built for this Mac/.test(unfold(r.stdout)) && fs.existsSync(bin(home)), "the installer builds the glow helper", r.stdout + r.stderr);
check(cfg.host.overlayBin === bin(home), "the worker config's overlayBin is the helper it built", cfg.host.overlayBin);
doc = doctor(home);
check(/ok\s+blue glow and Daisy cursor helper is built/.test(doc), "the doctor then says it is built", doc);
const arch = spawnSync("lipo", ["-archs", bin(home)], { encoding: "utf8" }).stdout.trim();
check(arch === spawnSync("uname", ["-m"], { encoding: "utf8" }).stdout.trim(), `built for this Mac's chip (${arch})`);
const plist = fs.readFileSync(path.join(home, ".daisy", "overlay", "DaisyOverlay.app", "Contents", "Info.plist"), "utf8");
check(/LSMinimumSystemVersion<\/key><string>13\.0</.test(plist) && /<key>LSUIElement<\/key><true\/>/.test(plist), "runs on macOS 13 or newer, with no Dock icon");
check(spawnSync("codesign", ["--verify", path.join(home, ".daisy", "overlay", "DaisyOverlay.app")]).status === 0, "the app is signed (ad hoc)");
const disp = spawnSync(bin(home), ["--print-displays"], { encoding: "utf8", timeout: 10_000 });
let displays = null; try { displays = JSON.parse(disp.stdout).displays; } catch {}
check(Array.isArray(displays), `the built helper runs and answers --print-displays (${displays ? displays.length : "no"} display(s))`, disp.stdout + disp.stderr);
// The worker hands that path to the host lane.
const workerSrc = fs.readFileSync(path.join(home, "Projects", "daisy-handoff", "worker", "worker.mjs"), "utf8");
check(/HOST_OVERLAY_BIN: overlayBin\(\)/.test(workerSrc) && /CFG\.host\?\.overlayBin \|\|/.test(workerSrc), "the worker passes the config's overlayBin to the host lane as HOST_OVERLAY_BIN");

// 3. With the command line and desktop control off, nothing is built.
({ r, home } = install(["--build-overlay", "--no-power-lanes"]));
check(r.status === 0 && !/blue glow/.test(r.stdout) && !fs.existsSync(bin(home)), "with desktop control off, nothing is built", r.stdout);

// 4. Command Line Tools missing: the install finishes and says how to get the glow. A helper already in place (here a planted
// one, as after a leak) is removed rather than left for the worker to launch.
const fake = fs.mkdtempSync(path.join(os.tmpdir(), "overlay-fake-")); homes.push(fake);
const plant = (home) => { fs.mkdirSync(path.dirname(bin(home)), { recursive: true }); fs.writeFileSync(bin(home), "#!/bin/sh\necho planted\n", { mode: 0o755 }); };
const withPlant = (args, env) => { const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "overlay-build-"))); homes.push(home); plant(home);
  const r = spawnSync(process.execPath, [path.join(REPO, "install.mjs"), "--dry-run", "--yes", "--name", "Tester", "--assistant", "Daisy", ...args, "--home", home], { encoding: "utf8", env: { ...process.env, ...env } });
  return { r, home }; };
fs.writeFileSync(path.join(fake, "xcrun"), "#!/bin/sh\necho 'xcrun: error: invalid active developer path' >&2\nexit 1\n", { mode: 0o755 });
({ r, home } = withPlant(["--build-overlay"], { PATH: `${fake}:${process.env.PATH}` }));
check(r.status === 0 && /desktop control works, but the blue glow and cursor weren't built: Apple's Command Line Tools are missing/.test(unfold(r.stdout)) && !fs.existsSync(bin(home)) && /COMPLETE/.test(r.stdout), "no Command Line Tools: the install finishes, says what's missing and leaves no old helper", r.stdout);

// 5. The build itself fails: the install still finishes, and the old helper is gone.
fs.writeFileSync(path.join(fake, "xcrun"), "#!/bin/sh\n[ \"$1\" = --find ] && { echo /usr/bin/swiftc; exit 0; }\necho 'error: compile failed' >&2\nexit 1\n", { mode: 0o755 });
({ r, home } = withPlant(["--build-overlay"], { PATH: `${fake}:${process.env.PATH}` }));
check(r.status === 0 && /desktop control works, but the blue glow and cursor didn't build/.test(unfold(r.stdout)) && !fs.existsSync(bin(home)) && /COMPLETE/.test(r.stdout), "a failed build: the install finishes, says so and leaves no old helper", r.stdout);

for (const h of homes) fs.rmSync(h, { recursive: true, force: true });
console.log(fail ? `overlay build: ${fail} FAILED` : "overlay build: all checks passed");
process.exit(fail ? 1 : 0);
