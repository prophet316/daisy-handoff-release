// Drives worker/host-lane.mjs directly over MCP stdio (no Claude), on {{OWNER}}'s real desktop, for the 4d checks:
// Calculator 1234+4321 (one display), optionally a move of its window to the other display and back, then quit.
// Prints one JSON line with the answer, {{OWNER}}'s pointer before/after (from cua-driver), and the lane's log.
// Usage: node test/host-lane-drive.mjs <job dir> [--move] [--hold-ms N] [--kill-lane]
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = process.argv[2];
const MOVE = process.argv.includes("--move");
const HOLD = Number(process.argv[process.argv.indexOf("--hold-ms") + 1]) || 0;
const CRASH = process.argv.includes("--kill-lane"); // kill -9 the lane right after its first look, to prove the glow still clears
mkdirSync(dir, { recursive: true });
const DRIVER = process.env.CUA_DRIVER_BIN || join(homedir(), ".local", "bin", "cua-driver");
const ptr = () => JSON.parse(execFileSync(DRIVER, ["call", "get_cursor_position", "{}"]).toString());

const lane = spawn(process.execPath, [join(ROOT, "worker", "host-lane.mjs")], {
  stdio: ["pipe", "pipe", "inherit"],
  env: { ...process.env, CUA_JOB_DIR: dir, CUA_ALLOW: "", HOST_REQUEST: "on my Mac: open Calculator, add 1234 and 4321, quit it", HOST_IDLE_SECONDS: process.env.HOST_IDLE_SECONDS || "10",
    HOST_OVERLAY_BIN: process.env.HOST_OVERLAY_BIN || join(homedir(), "{{DOTDIR}}", "overlay", "DaisyOverlay.app", "Contents", "MacOS", "DaisyOverlay"), HOST_OVERLAY: process.env.HOST_OVERLAY || "1" },
});
let n = 0, buf = "";
const wait = new Map();
lane.stdout.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); wait.get(m.id)?.(m); } });
const rpc = (method, params) => new Promise((r) => { const id = ++n; wait.set(id, r); lane.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"); });
const tool = async (name, args = {}) => { const m = await rpc("tools/call", { name, arguments: args }); const t = m.result.content.filter((c) => c.type === "text").map((c) => c.text).join("\n"); if (m.result.isError) throw new Error(`${name}: ${t}`); return t; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const token = (tree, label) => (tree.match(new RegExp(`\\[([^\\]]+)\\] AXButton "${label}"`)) || [])[1];

const out = { pointerBefore: ptr() };
await rpc("initialize", {});
try {
  const opened = await tool("launch_app", { name: "Calculator", intent: "open Calculator for the sum {{OWNER}} asked for" });
  const pid = Number(opened.match(/pid (\d+)/)[1]);
  let wl = "";
  // The first window listed can be an off-screen strip (seen on macOS 15); take the first one on screen.
  const onScreen = () => wl.split("\n").find((l) => /window_id \d+/.test(l) && !/off screen/.test(l));
  for (let i = 0; i < 10 && !onScreen(); i++) { await sleep(500); wl = await tool("list_windows", { pid }); }
  const wid = Number(onScreen().match(/window_id (\d+)/)[1]);
  out.window = wl.split("\n")[0];
  let tree = await tool("get_window_state", { pid, window_id: wid });
  if (CRASH) {
    await sleep(800);
    lane.kill("SIGKILL");
    await sleep(2500);
    try { process.kill(pid, "SIGTERM"); } catch {} // the Calculator this drive opened
    out.killed = true;
    out.overlayLog = existsSync(join(dir, "overlay.log")) ? readFileSync(join(dir, "overlay.log"), "utf8") : "";
    console.log(JSON.stringify(out));
    process.exit(0);
  }
  const press = async (l) => { tree = await tool("get_window_state", { pid, window_id: wid, query: l }); await tool("click", { pid, window_id: wid, element_token: token(tree, l), intent: `press the ${l} key on the calculator` }); };
  await press(token(tree, "All Clear") ? "All Clear" : "Clear");
  for (const l of ["1", "2", "3", "4", "Add", "4", "3", "2", "1", "Equals"]) await press(l);
  tree = await tool("get_window_state", { pid, window_id: wid });
  out.answerSeen = /5[,.]?555/.test(tree);
  if (MOVE) {
    out.displays = await tool("list_displays");
    const b = out.window.match(/at (-?\d+),(-?\d+)/).map(Number);
    const other = b[1] >= 0 ? { x: -1600, y: 300 } : { x: 400, y: 300 };
    out.move1 = await tool("move_window", { pid, window_id: wid, x: other.x, y: other.y, intent: "move the Calculator window to the other display" });
    out.after1 = (await tool("list_windows", { pid })).split("\n")[0];
    out.move2 = await tool("move_window", { pid, window_id: wid, x: b[1], y: b[2], intent: "move the Calculator window back where it was" });
  }
  if (HOLD) await sleep(HOLD);
  out.quit = await tool("quit_app", { pid, intent: "quit Calculator, which this job opened" });
} catch (e) { out.error = e.message; }
out.pointerAfter = ptr();
lane.stdin.end();
await new Promise((r) => lane.on("exit", r));
await sleep(1500); // the overlay fades out after the lane closes
out.overlayLog = existsSync(join(dir, "overlay.log")) ? readFileSync(join(dir, "overlay.log"), "utf8") : "";
out.actions = existsSync(join(dir, "host-actions.log")) ? readFileSync(join(dir, "host-actions.log"), "utf8") : "";
console.log(JSON.stringify(out));
