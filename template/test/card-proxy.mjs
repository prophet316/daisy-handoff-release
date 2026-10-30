// Serves the job card test host (test/card-bridge.html and the SDK bridge) and passes its MCP calls on to a {{ASSISTANT}} server,
// so a button pressed in the card really reaches the connector, the way Claude proxies a card's tools/call.
// /card.html is the card exactly as the server serves it (resources/read). Usage: node test/card-proxy.mjs <port> <mcp url>
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const [port, mcp] = [Number(process.argv[2]), process.argv[3]];
const here = dirname(fileURLToPath(import.meta.url));
const FILES = { "/card-bridge.html": ["card-bridge.html", "text/html"], "/vendor/ext-apps-bridge.js": ["vendor/ext-apps-bridge.js", "text/javascript"] };
const call = async (body) => (await fetch(mcp, { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": "curl/8.7.1" }, body })).text(); // the live workers.dev URL refuses some default agents

createServer(async (req, res) => {
  try {
    const path = new URL(req.url, "http://x").pathname;
    if (req.method === "POST" && path === "/mcp") {
      let body = ""; for await (const c of req) body += c;
      res.writeHead(200, { "Content-Type": "application/json" }); return res.end(await call(body));
    }
    if (path === "/card.html") {
      const r = JSON.parse(await call(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "resources/read", params: { uri: "ui://daisy/job-card.html" } })));
      res.writeHead(200, { "Content-Type": "text/html" }); return res.end(r.result.contents[0].text);
    }
    const f = FILES[path];
    if (!f) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": f[1] }); res.end(await readFile(join(here, f[0])));
  } catch (e) { res.writeHead(500); res.end(String(e)); }
}).listen(port, "127.0.0.1");
