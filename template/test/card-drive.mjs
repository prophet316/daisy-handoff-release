// Drives test/card-bridge.html in headless Chrome over the DevTools protocol (real frames, so the card's ResizeObserver and
// animation frames run, unlike --dump-dom), prints the host log, and can save a screenshot of the card as {{OWNER}} would see it.
// Usage: node test/card-drive.mjs <base url, e.g. http://127.0.0.1:8788> "<query>" [screenshot.png]
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const [base, query, shot] = process.argv.slice(2);
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = mkdtempSync(join(tmpdir(), "card-chrome-"));
const width = Number(new URLSearchParams(query).get("width") || 600) + 32;
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--no-first-run", "--hide-scrollbars", `--user-data-dir=${profile}`,
  "--remote-debugging-port=0", `--window-size=${width},1600`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
const wsUrl = await new Promise((ok, no) => {
  let err = ""; chrome.stderr.on("data", (d) => { err += d; const m = /DevTools listening on (ws:\S+)/.exec(err); if (m) ok(m[1]); });
  setTimeout(() => no(new Error("Chrome did not start")), 15000);
});
const port = new URL(wsUrl).port;
const page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let n = 0; const wait = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m.result); wait.delete(m.id); } });
const cdp = (method, params = {}) => new Promise((r) => { const id = ++n; wait.set(id, r); ws.send(JSON.stringify({ id, method, params })); });
const text = async () => (await cdp("Runtime.evaluate", { expression: "document.getElementById('log').textContent" })).result.value || "";

let out = "";
try {
  await cdp("Page.enable");
  await cdp("Page.navigate", { url: `${base}/card-bridge.html?${query}` });
  for (let i = 0; i < 120 && !/\nDONE/.test(out = await text()); i++) await sleep(250);
  if (shot && /\nDONE/.test(out)) {
    await cdp("Runtime.evaluate", { expression: "document.body.classList.add('shot')" });
    await sleep(300);
    const box = (await cdp("Runtime.evaluate", { expression: "(() => { const f = document.querySelector('iframe'); return [f ? f.getBoundingClientRect().bottom : 400] })()", returnByValue: true })).result.value;
    const img = await cdp("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, width, height: Math.ceil(box[0]) + 16, scale: 2 } });
    writeFileSync(shot, Buffer.from(img.data, "base64"));
  }
} finally { ws.close(); chrome.kill(); await sleep(300); rmSync(profile, { recursive: true, force: true }); }
console.log(out);
