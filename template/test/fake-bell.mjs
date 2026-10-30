// A stand-in phone bell for sandbox tests: logs every event to a file instead of pushing to {{OWNER}}'s phone.
// Usage: node test/fake-bell.mjs <port> <events.jsonl>
import { createServer } from "node:http";
import { appendFileSync } from "node:fs";
const [port, out] = process.argv.slice(2);
createServer((req, res) => {
  if (req.method === "GET") { res.end("ok"); return; }
  let b = ""; req.on("data", (d) => (b += d)); req.on("end", () => { appendFileSync(out, b.replace(/\n/g, " ") + "\n"); res.end("ok"); });
}).listen(Number(port), "127.0.0.1");
