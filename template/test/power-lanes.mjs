// Command line and desktop control ("power lanes") are on by default; --no-power-lanes turns them off. Checks both states, offline:
// the connector (src/index.js, imported directly) hides and refuses the tools when off and lists them when on; the worker
// (worker/worker.mjs --once against a fake connector) and the supervisor's check refuse their jobs and commands when off.
// Usage: node test/power-lanes.mjs   (run by ./test.sh gate)
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { timingSafeEqual } from "node:crypto";
import { powerRefusal, POWER_OFF } from "../worker/power.mjs";

// Cloudflare Workers have crypto.subtle.timingSafeEqual; Node has it on node:crypto.
crypto.subtle.timingSafeEqual ??= (a, b) => timingSafeEqual(a, b);
const { default: connector } = await import("../src/index.js");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const POWER_TOOLS = ["look_at_screen", "use_computer", "run_command", "command_result"];
let pass = 0, fail = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  power: ${name}${ok || !extra ? "" : `  (${extra})`}`); ok ? pass++ : fail++; };

// ---- 1. the connector ----
async function rpc(env, method, params = {}) {
  const r = await connector.fetch(new Request("https://test.invalid/k/mcp", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }), env);
  return (await r.json()).result;
}
for (const state of [undefined, "off", "on"]) {
  const env = { CONNECTOR_KEY: "k", JOB_CARDS: "on", ...(state ? { POWER_LANES: state } : {}) };
  const on = state === "on", label = state ? `POWER_LANES "${state}"` : "POWER_LANES not set";
  const names = (await rpc(env, "tools/list")).tools.map((t) => t.name);
  const shown = POWER_TOOLS.filter((t) => names.includes(t));
  check(`${label}: tools/list ${on ? "includes" : "leaves out"} ${POWER_TOOLS.join(", ")}`, on ? shown.length === POWER_TOOLS.length : shown.length === 0, `shown: ${shown.join(", ") || "none"}`);
  check(`${label}: tools/list still has add_job and get_job`, names.includes("add_job") && names.includes("get_job"));
  check(`${label}: ${on ? 31 : 27} tools in all`, names.length === (on ? 31 : 27), `${names.length}`);
  const init = await rpc(env, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } });
  check(`${label}: instructions ${on ? "mention" : "don't mention"} run_command and use_computer`, /run_command|use_computer/.test(init.instructions) === on);
  for (const [name, args] of [["run_command", { command: "echo hi" }], ["use_computer", { task: "on my Mac, open Safari" }], ["look_at_screen", {}], ["command_result", { id: 1 }]]) {
    const r = await rpc(env, "tools/call", { name, arguments: args });
    const text = r.content?.[0]?.text || "";
    if (on) check(`${label}: ${name} reaches its handler`, text !== POWER_OFF, text);
    else check(`${label}: ${name} is refused with the turned-off message`, r.isError === true && text === POWER_OFF, text);
  }
}

check("the turned-off message says how to turn them on", /--power-lanes/.test(POWER_OFF) && /answer yes/.test(POWER_OFF));

// ---- 2. the supervisor's check (run_command reaches the Mac as a "shell" control command) ----
check("supervisor refuses shell commands when powerLanes is false or missing", powerRefusal({ powerLanes: false }, { kind: "shell" }) === POWER_OFF && powerRefusal({}, { kind: "shell" }) === POWER_OFF);
check("supervisor runs shell commands when powerLanes is true", powerRefusal({ powerLanes: true }, { kind: "shell" }) === null);
check("supervisor still carries out stops, kills, restarts and status when off", ["stop", "kill", "restart", "status"].every((kind) => powerRefusal({}, { kind }) === null));
check("worker refuses screen and computer jobs when off, runs them when on", ["screen", "computer"].every((mode) => powerRefusal({}, { mode }) === POWER_OFF && powerRefusal({ powerLanes: true }, { mode }) === null));
check("worker runs code, research, writing and design jobs when off", ["code", "research", "writing", "design", undefined].every((mode) => powerRefusal({}, { mode }) === null));

// ---- 3. the worker end to end: a fake connector hands it jobs; it must refuse them before doing anything ----
async function runWorker(powerLanes, jobs) {
  const finished = [];
  const queue = [...jobs];
  const srv = http.createServer((req, res) => {
    let body = ""; req.on("data", (d) => (body += d)); req.on("end", () => {
      const route = req.url.split("/").pop(), b = body ? JSON.parse(body) : {};
      if (route === "claim") return res.end(JSON.stringify({ job: queue.shift() || null }));
      if (route === "finish") finished.push(b);
      res.end("{}");
    });
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const tmp = mkdtempSync(join(tmpdir(), "power-lanes-"));
  const tag = `power-test-${process.pid}`;
  mkdirSync(join(ROOT, "logs"), { recursive: true });
  writeFileSync(join(ROOT, "logs", `.${tag}-key`), "testkey");
  const cfg = join(tmp, "config.json");
  writeFileSync(cfg, JSON.stringify({ base: `http://127.0.0.1:${srv.address().port}`, workerTag: tag, keyFile: `logs/.${tag}-key`,
    aliveFile: `logs/.${tag}-alive`, logFile: `logs/${tag}.log`, pollSeconds: 1, maxParallel: 1, claudeBin: "/usr/bin/false", powerLanes }));
  // Async, so the fake connector in this process can answer while the worker runs.
  const w = await new Promise((resolve) => {
    const c = spawn(process.execPath, [join(ROOT, "worker", "worker.mjs"), "--once", "--no-reset", "--config", cfg], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = ""; c.stdout.resume(); c.stderr.on("data", (d) => (stderr += d));
    const t = setTimeout(() => c.kill("SIGKILL"), 60_000);
    c.on("close", (status) => { clearTimeout(t); resolve({ status, stderr }); });
  });
  srv.close();
  for (const f of [`.${tag}-key`, `.${tag}-alive`, `${tag}.log`]) rmSync(join(ROOT, "logs", f), { force: true });
  for (const j of jobs) rmSync(join(ROOT, "jobs", j.id), { recursive: true, force: true });
  rmSync(tmp, { recursive: true, force: true });
  return { finished, code: w.status, err: w.stderr };
}
const job = (id, mode, extra = {}) => ({ id, title: `power test ${mode}`, details: "power lanes test", mode, status: "running", ...extra });
const off = await runWorker(false, [job("pt-screen", "screen"), job("pt-host", "computer", { target: "host", project_dir: "/tmp" }), job("pt-vm", "computer", { target: "vm", project_dir: "/tmp" })]);
check("worker with powerLanes false exits cleanly", off.code === 0, off.err.slice(-300));
for (const id of ["pt-screen", "pt-host", "pt-vm"]) {
  const f = off.finished.find((x) => x.id === id);
  check(`worker with powerLanes false refuses ${id.slice(3)} job`, f?.status === "failed" && f.result.startsWith(POWER_OFF), JSON.stringify(f));
}
// On: the power check lets the job through to the lane's own checks (no CUA lane in this config, so nothing touches a desktop).
const on = await runWorker(true, [job("pt-vm", "computer", { target: "vm", project_dir: "/tmp" })]);
const f = on.finished.find((x) => x.id === "pt-vm");
check("worker with powerLanes true passes a computer job on to the lane", f && !f.result.includes(POWER_OFF) && /CUA lane is not set up/.test(f.result), JSON.stringify(f));

console.log(`power lanes: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
