// Drives worker/host-lane.mjs over MCP stdio against test/fake-cua-driver.mjs (no desktop, no Claude) to check the gate
// end to end: Return, searching and pages go through; posts and details on other sites stop; a task {{OWNER}} asked for
// runs every step until the charge, which is held once for {{HIS}} approve card, then pressed once after approval.
// Usage: node test/gate-drive.mjs   (run by ./test.sh gate)
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, chmodSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FAKE = join(ROOT, "test", "fake-cua-driver.mjs");
chmodSync(FAKE, 0o755);
const REQ = "On my Mac, go to walmart.com, find toilet paper, add to cart, pay, and deliver to home";
let pass = 0, fail = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  drive: ${name}${ok || !extra ? "" : `  (${extra})`}`); ok ? pass++ : fail++; };

function lane(dir, env = {}) {
  const p = spawn(process.execPath, [join(ROOT, "worker", "host-lane.mjs")], { stdio: ["pipe", "pipe", "inherit"], env: {
    ...process.env, CUA_DRIVER_BIN: FAKE, CUA_JOB_DIR: dir, CUA_ALLOW: "", HOST_REQUEST: REQ, HOST_IDLE_CMD: "echo 999", HOST_IDLE_SECONDS: "0",
    HOST_OVERLAY: "0", HOST_APP_NAME: "Google Chrome", FAKE_DRIVER_LOG: join(dir, "driver.jsonl"), ...env } });
  let n = 0, buf = "";
  const wait = new Map();
  p.stdout.on("data", (d) => { buf += d; let i; while ((i = buf.indexOf("\n")) >= 0) { const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); wait.get(m.id)?.(m); } });
  const tool = (name, args = {}) => new Promise((r) => { const id = ++n; wait.set(id, (m) => r({ err: !!m.result.isError, text: m.result.content.filter((c) => c.type === "text").map((c) => c.text).join("\n") }));
    p.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }) + "\n"); });
  return { tool, end: () => p.stdin.end() };
}
const calls = (dir) => existsSync(join(dir, "driver.jsonl")) ? readFileSync(join(dir, "driver.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l)) : [];
const held = (dir) => { try { return JSON.parse(readFileSync(join(dir, ".cua-held.json"), "utf8")).flatMap((h) => h.blocked); } catch { return []; } };
const P = 4242, look = { pid: P, window_id: 7 };

// 1. The task run: every step goes through, posts don't, the charge is held.
const d1 = mkdtempSync(join(tmpdir(), "gate-drive-"));
let L = lane(d1);
await L.tool("get_window_state", look);
let r = await L.tool("type_text", { pid: P, element_token: "t:5", text: "toilet paper", intent: "type toilet paper in the search box" });
check("typing a search goes through", !r.err, r.text);
r = await L.tool("press_key", { pid: P, key: "return", intent: "submit the search" });
check("Return to submit the search goes through", !r.err, r.text);
const ret = calls(d1).find((c) => c.tool === "press_key");
check("Return goes to the exact window, as a real key press", ret?.args.window_id === 7 && ret?.args.delivery_mode === "foreground", JSON.stringify(ret?.args));
r = await L.tool("click", { pid: P, element_token: "t:2", intent: "click Add to cart" });
check("Add to cart goes through", !r.err, r.text);
r = await L.tool("type_text", { pid: P, element_token: "t:3", text: "12 Oak Lane", intent: "enter the delivery address" });
check("delivery address on walmart.com goes through", !r.err, r.text);
r = await L.tool("click", { pid: P, element_token: "t:6", intent: "post a review of the toilet paper" });
check("posting a review is blocked", r.err && /post/.test(r.text), r.text);
r = await L.tool("click", { pid: P, element_token: "t:4", intent: "click the button to finish" });
check("Place order is held for the approve card", r.err && /charges money/.test(r.text) && /purchase\.json/.test(r.text), r.text);
check("the gate's record says charge", held(d1).includes("charge") && held(d1).includes("post"), JSON.stringify(held(d1)));
check("the Place order click never reached the driver", !calls(d1).some((c) => c.tool === "click" && c.args.element_token === "t:4"));
L.end();

// 2. The approve card: the worker's line from purchase.json, and the approved run gets exactly charge back.
writeFileSync(join(d1, "purchase.json"), JSON.stringify({ items: ["Great Value toilet paper, 12 mega rolls x1"], total: "$12.97", deliver_to: "12 Oak Lane, Home", site: "walmart.com" }));
const tmp = mkdtempSync(join(tmpdir(), "gate-cfg-"));
writeFileSync(join(tmp, "key"), "test");
writeFileSync(join(tmp, "config.json"), JSON.stringify({ base: "http://127.0.0.1:9", keyFile: relative(ROOT, join(tmp, "key")), claudeBin: "/usr/bin/false" }));
process.env.DAISY_NO_MAIN = "1";
process.argv.push("--config", join(tmp, "config.json"));
const { purchaseLine, cuaAllow } = await import(join(ROOT, "worker", "worker.mjs"));
const line = purchaseLine(d1) || "";
check("approve card names item, total and address", /toilet paper/.test(line) && /\$12\.97/.test(line) && /12 Oak Lane/.test(line) && /Nothing has been charged/.test(line), line);
check("no card line without a held charge", purchaseLine(tmp) === null);
const allow = cuaAllow({ allow: "[]" }, d1, true).allow;
check("approved run allows charge", allow.includes("charge"), JSON.stringify(allow));
check("a fresh run never allows charge", !cuaAllow({ allow: JSON.stringify(["buy", "charge"]) }, d1, false).allow.includes("charge"));
// The agent stopped at the order page itself (no gate record), writing purchase.json in its own shape: still one card, one charge.
const d5 = mkdtempSync(join(tmpdir(), "gate-drive-"));
writeFileSync(join(d5, "purchase.json"), JSON.stringify({ site: "Test Shop (http://127.0.0.1:8765/)", items: [{ name: "Soft Toilet Paper, 12 rolls", quantity: 1, price: "$12.97" }], total: "$14.02",
  delivery_address: { name: "Sam Rivera", street: "12 Oak Lane", city: "Springfield" } }));
const line5 = purchaseLine(d5) || "";
check("card line from the agent's own purchase.json shape", /1 x Soft Toilet Paper, 12 rolls \(\$12\.97\)/.test(line5) && /Total \$14\.02/.test(line5) && /12 Oak Lane, Springfield/.test(line5) && !/object Object/.test(line5), line5);
check("approving that card allows the one charge", cuaAllow({ allow: "[]" }, d5, true).allow.includes("charge"));

// 3. The approved run: the charge is pressed once; a second one is held again.
const d2 = mkdtempSync(join(tmpdir(), "gate-drive-"));
L = lane(d2, { CUA_ALLOW: allow.join(",") });
await L.tool("get_window_state", look);
r = await L.tool("click", { pid: P, element_token: "t:4", intent: "click Place order, as Sam approved" });
check("approved: Place order pressed", !r.err && calls(d2).some((c) => c.tool === "click" && c.args.element_token === "t:4"), r.text);
await L.tool("get_window_state", look);
r = await L.tool("click", { pid: P, element_token: "t:4", intent: "click Place order again" });
check("approved: a second charge is held again", r.err && /charges money/.test(r.text), r.text);
L.end();

// 4. A page that sends her details somewhere else.
const d3 = mkdtempSync(join(tmpdir(), "gate-drive-"));
L = lane(d3, { FAKE_PAGE_URL: "secure-pay.example.biz/verify" });
await L.tool("get_window_state", look);
r = await L.tool("type_text", { pid: P, element_token: "t:3", text: "12 Oak Lane", intent: "enter the delivery address" });
check("address on a redirected site is blocked", r.err && /personal/.test(r.text), r.text);
r = await L.tool("type_text", { pid: P, element_token: "t:3", text: "4111 1111 1111 1111", intent: "enter the card number" });
check("card number on a redirected site is blocked", r.err && /personal/.test(r.text), r.text);
L.end();

// 5. Opening a page with a browser {{OWNER}} didn't ask for is refused (it never switches browsers on its own).
const d4 = mkdtempSync(join(tmpdir(), "gate-drive-"));
L = lane(d4, { HOST_REQUEST: "On my Mac, use Google Chrome and look up John 3:16 on biblegateway.com" });
r = await L.tool("open_url", { url: "https://www.biblegateway.com/", browser: "Safari", intent: "open Bible Gateway" });
check("open_url refuses a different browser", r.err && /never switch browsers/.test(r.text), r.text);
L.end();

console.log(`gate drive: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
