#!/usr/bin/env node
// A stand-in for `cua-driver call <tool> <json>` for test/gate-drive.mjs: one browser window showing a checkout page.
// Every call is appended to $FAKE_DRIVER_LOG as one JSON line, so the test can check what reached the "driver".
// $FAKE_PAGE_URL sets what the address bar shows (default www.walmart.com/checkout); $FAKE_PAGE_URL_<window_id> for one window.
// Window 7's element tokens are t:1 to t:6; another window's are w<id>:t:1 and so on. $FAKE_EXTRA_ELS (JSON) adds elements,
// and so does the JSON in the file $FAKE_EXTRA_FILE, read on every call (a pane that opens after a look).
// $FAKE_EXTRA_ELS_<window_id> adds elements to that window only.
import { appendFileSync, readFileSync } from "node:fs";

const [, , cmd, tool, raw] = process.argv;
let args = {};
try { args = JSON.parse(raw || "{}"); } catch {}
if (process.env.FAKE_DRIVER_LOG) appendFileSync(process.env.FAKE_DRIVER_LOG, JSON.stringify({ tool, args }) + "\n");
if (cmd !== "call") { console.log("{}"); process.exit(0); }

const PID = Number(process.env.FAKE_PID || 4242);
const win = { window_id: 7, pid: PID, app_name: "Google Chrome", title: "Checkout", is_on_screen: true, bounds: { x: 0, y: 0, width: 1200, height: 800 } };
const wid = args.window_id || 7;
const tok = (i) => (wid === 7 ? `t:${i}` : `w${wid}:t:${i}`);
// frame is in screen points; screenshot_frame the same rect in the window's screenshot pixels (here 1:1, window at 0,0).
const el = (i, role, label, value, frame = { x: 10 * i, y: 10, w: 100, h: 30 }) => ({ element_token: tok(i), role, label, value, frame, screenshot_frame: frame });
let extra = [];
try { extra = JSON.parse(process.env.FAKE_EXTRA_ELS || "[]"); } catch {}
try { extra = extra.concat(JSON.parse(process.env[`FAKE_EXTRA_ELS_${wid}`] || "[]")); } catch {}
try { if (process.env.FAKE_EXTRA_FILE) extra = extra.concat(JSON.parse(readFileSync(process.env.FAKE_EXTRA_FILE, "utf8"))); } catch {}
const out = {
  list_windows: { windows: [win] },
  list_apps: { apps: [{ name: "Google Chrome", pid: PID, running: true, active: true }] },
  get_window_state: { elements: [
    el(1, "AXTextField", "Address and search bar", process.env[`FAKE_PAGE_URL_${wid}`] || process.env.FAKE_PAGE_URL || "www.walmart.com/checkout"),
    el(2, "AXButton", "Add to cart"),
    el(3, "AXTextField", "Street address", ""),
    el(4, "AXButton", "Place order"),
    el(5, "AXTextField", "Search", ""),
    el(6, "AXButton", "Post a review"),
    ...extra.map((e, i) => ({ ...el(7 + i, e.role, e.label, e.value, e.frame), ...(e.focused ? { focused: true } : {}) })),
  ] },
  get_cursor_position: { x: 1, y: 1 },
}[tool] || { effect: "confirmed", summary: `fake ${tool}` };
console.log(JSON.stringify(out));
