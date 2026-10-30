// Proves a real click passes through {{ASSISTANT}}'s glow: frosts the main display, puts a small test window under the edge
// band, sends one real desktop click there (cua-driver click scope=desktop), and checks the test window got it.
// It also asks WindowServer which window a mouse-down would hit inside each frosted band (never {{ASSISTANT}}'s).
// This is the one place a test moves the real pointer (it simulates {{OWNER}}'s own click), so it runs only when nobody has
// touched the mouse or keyboard for 30 s, and puts the pointer back at once.
// Usage: node test/clickthrough.mjs <dir>   prints one JSON line
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const dir = process.argv[2];
mkdirSync(dir, { recursive: true });
const BIN = process.env.HOST_OVERLAY_BIN || join(homedir(), "{{DOTDIR}}", "overlay", "DaisyOverlay.app", "Contents", "MacOS", "DaisyOverlay");
const DRIVER = join(homedir(), ".local", "bin", "cua-driver");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const idle = () => Number(execFileSync("/usr/sbin/ioreg", ["-c", "IOHIDSystem", "-d", "4"]).toString().match(/"HIDIdleTime"\s*=\s*(\d+)/)[1]) / 1e9;
const ptr = () => JSON.parse(execFileSync(DRIVER, ["call", "get_cursor_position", "{}"]).toString());
const lines = (p, on) => { let b = ""; p.stdout.on("data", (d) => { b += d; let i; while ((i = b.indexOf("\n")) >= 0) { on(JSON.parse(b.slice(0, i))); b = b.slice(i + 1); } }); };

const out = { idle: Math.round(idle()) };
if (out.idle < 30) { out.skipped = "someone is using the Mac"; console.log(JSON.stringify(out)); process.exit(0); }
const ov = spawn(BIN, ["--job-dir", dir], { stdio: ["pipe", "pipe", "ignore"] });
const replies = new Map();
lines(ov, (m) => replies.get(m.id)?.(m));
let n = 0;
const ask = (c) => new Promise((r) => { const id = ++n; replies.set(id, r); ov.stdin.write(JSON.stringify({ ...c, id }) + "\n"); });
await sleep(400);
await ask({ cmd: "frost", rects: [[0, 0, 1, 1]] });
await sleep(900);
// the test window sits in the left edge band of the main display, under the glow
const rect = [24, 520, 60, 60];
const tgt = spawn(BIN, ["--click-target", ...rect.map(String)], { stdio: ["ignore", "pipe", "ignore"] });
let clicked = null, ready = null;
lines(tgt, (m) => { if (m.ready) ready = m; if (m.clicked) clicked = m.clicked; });
for (let i = 0; i < 40 && !ready; i++) await sleep(100);
await sleep(300);
const st = (await ask({ cmd: "state" })).state;
out.frosted = st.frosted.map((f) => f.id);
out.glowIgnoresMouse = st.glowWindows.every((g) => g.ignoresMouse);
out.hits = st.hits;
out.hitNeverDaisy = st.hits.length > 0 && st.hits.every((h) => !h.daisy);
const p0 = ptr();
// screen pixels of the main display (2x): the centre of the test window
const scale = JSON.parse(execFileSync(DRIVER, ["call", "get_screen_size", "{}"]).toString()).scale_factor || 2;
const cx = (rect[0] + rect[2] / 2) * scale, cy = (rect[1] + rect[3] / 2) * scale;
try { execFileSync(DRIVER, ["call", "click", JSON.stringify({ x: cx, y: cy, scope: "desktop" })]); } catch (e) { out.clickError = String(e.stdout || e.message).slice(0, 300); }
for (let i = 0; i < 30 && !clicked; i++) await sleep(100);
execFileSync(BIN, ["--warp", String(p0.x), String(p0.y)]);
await sleep(200);
out.pointerBefore = p0;
out.pointerRestored = ptr();
out.clickReachedWindowUnderGlow = !!clicked;
out.clickedAt = clicked;
tgt.kill();
ov.stdin.end();
await new Promise((r) => ov.on("exit", r));
console.log(JSON.stringify(out));
