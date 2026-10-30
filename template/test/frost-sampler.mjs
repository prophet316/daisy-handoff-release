// Watches a job folder's .overlay-state.json and captures both displays each time the set of frosted displays changes
// (and every few seconds while any is frosted), so the evidence shows exactly which screens were frosted when.
// Each sample: {t, frosted ids, pointer, blue per display (test/edge-blue.mjs), files}, one JSON line in <out>/samples.jsonl.
// Runs until <out>/STOP exists. Usage: node test/frost-sampler.mjs <job dir> <out dir>
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, mkdirSync, appendFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const [dir, out] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const EDGE = join(dirname(fileURLToPath(import.meta.url)), "edge-blue.mjs");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let last = null, lastShot = 0, n = 0;

function shoot(why, st) {
  const k = String(++n).padStart(3, "0");
  const files = [join(out, `${k}-1.png`), join(out, `${k}-2.png`)];
  try { execFileSync("/usr/sbin/screencapture", ["-x", ...files]); } catch { return; }
  let blue = [];
  try { blue = execFileSync(process.execPath, [EDGE, ...files.filter(existsSync)]).toString().trim().split("\n").map(Number); } catch {}
  appendFileSync(join(out, "samples.jsonl"), JSON.stringify({ t: new Date().toISOString(), why, frosted: st ? st.frosted.map((f) => f.id) : null, pointer: st?.pointer, cursor: st?.cursor, blue, files }) + "\n");
  lastShot = Date.now();
}

while (!existsSync(join(out, "STOP"))) {
  let st = null;
  try { st = JSON.parse(readFileSync(join(dir, ".overlay-state.json"), "utf8")); } catch {}
  const key = st ? st.frosted.map((f) => f.id).sort().join(",") : null;
  if (st && key !== last) {
    await sleep(700); // after the fade
    let now = st; try { now = JSON.parse(readFileSync(join(dir, ".overlay-state.json"), "utf8")); } catch {}
    shoot(`frost ${key || "none"}`, now);
    last = now.frosted.map((f) => f.id).sort().join(",");
  }
  else if (st && key && Date.now() - lastShot > 4000) shoot("periodic", st);
  await sleep(150);
}
