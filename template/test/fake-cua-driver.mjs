#!/usr/bin/env node
// A stand-in for `cua-driver call <tool> <json>` for test/gate-drive.mjs: one browser window showing a checkout page.
// Every call is appended to $FAKE_DRIVER_LOG as one JSON line, so the test can check what reached the "driver".
// $FAKE_PAGE_URL sets what the address bar shows (default www.walmart.com/checkout).
import { appendFileSync } from "node:fs";

const [, , cmd, tool, raw] = process.argv;
let args = {};
try { args = JSON.parse(raw || "{}"); } catch {}
if (process.env.FAKE_DRIVER_LOG) appendFileSync(process.env.FAKE_DRIVER_LOG, JSON.stringify({ tool, args }) + "\n");
if (cmd !== "call") { console.log("{}"); process.exit(0); }

const PID = Number(process.env.FAKE_PID || 4242);
const win = { window_id: 7, pid: PID, app_name: "Google Chrome", title: "Checkout", is_on_screen: true, bounds: { x: 0, y: 0, width: 1200, height: 800 } };
const el = (i, role, label, value) => ({ element_token: `t:${i}`, role, label, value, frame: { x: 10 * i, y: 10, w: 100, h: 30 } });
const out = {
  list_windows: { windows: [win] },
  list_apps: { apps: [{ name: "Google Chrome", pid: PID, running: true, active: true }] },
  get_window_state: { elements: [
    el(1, "AXTextField", "Address and search bar", process.env.FAKE_PAGE_URL || "www.walmart.com/checkout"),
    el(2, "AXButton", "Add to cart"),
    el(3, "AXTextField", "Street address", ""),
    el(4, "AXButton", "Place order"),
    el(5, "AXTextField", "Search", ""),
    el(6, "AXButton", "Post a review"),
  ] },
  get_cursor_position: { x: 1, y: 1 },
}[tool] || { effect: "confirmed", summary: `fake ${tool}` };
console.log(JSON.stringify(out));
