#!/usr/bin/env node
// Stand-in for the Composio CLI in local tests: records every call and answers like the real tools.
// FAKE_COMPOSIO_LOG: where calls are recorded. FAKE_COMPOSIO_FAIL=1: act like a revoked login.
import { readFileSync, appendFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
const [cmd, slug, ...rest] = process.argv.slice(2);
const d = rest.indexOf("-d"), f = rest.indexOf("--file"), acct = rest.indexOf("--account");
const data = d >= 0 ? JSON.parse(readFileSync(rest[d + 1].replace(/^@/, ""), "utf8")) : {};
const file = f >= 0 ? rest[f + 1] : null;
if (process.env.FAKE_COMPOSIO_LOG) appendFileSync(process.env.FAKE_COMPOSIO_LOG, JSON.stringify({ cmd, slug, data, file, account: acct >= 0 ? rest[acct + 1] : null }) + "\n");
if (process.env.FAKE_COMPOSIO_FAIL) { console.error("Error • Invalid or revoked user API key"); process.exit(1); }
// FAKE_COMPOSIO_NOID=<slug>: that tool succeeds but its answer has no id (how the old worker saw a stored-in-file answer).
if (process.env.FAKE_COMPOSIO_NOID === slug) { console.log(JSON.stringify({ successful: true, data: { message: "ok" }, error: null })); process.exit(0); }
const n = Date.now() % 100000;
const out = {
  GOOGLEDRIVE_GET_ABOUT: { user: { displayName: "Test Account", emailAddress: "test.account@example.com" } },
  GOOGLEDOCS_CREATE_DOCUMENT_MARKDOWN: { response_data: { documentId: `DOC${n}`, title: data.title } },
  GOOGLEDRIVE_UPLOAD_FILE: { id: `FILE${n}`, name: file && file.split("/").pop(), webViewLink: `https://drive.google.com/file/d/FILE${n}/view` },
  GOOGLEDRIVE_CREATE_PERMISSION: { id: "perm1", role: data.role, type: data.type },
  GMAIL_SEND_EMAIL: { id: `MSG${n}`, threadId: `THR${n}`, labelIds: ["SENT"] },
}[slug];
if (cmd !== "execute" || !out) { console.log(JSON.stringify({ successful: false, error: `unknown tool ${slug}` })); process.exit(1); }
console.log("Tip: something chatty first");
const full = { successful: true, data: out, error: null };
// FAKE_COMPOSIO_STORE=1: like the real CLI with a big answer, write it to a temp file and print only a pointer to it.
if (process.env.FAKE_COMPOSIO_STORE) {
  const dir = mkdtempSync(join(tmpdir(), "composio-fake-")), p = join(dir, `${slug}_OUTPUT_${n}.json`);
  writeFileSync(p, JSON.stringify(full));
  console.log(JSON.stringify({ successful: true, error: null, logId: "log_fake", storedInFile: true, sizeBytes: 162551, outputFilePath: p }, null, 2));
} else console.log(JSON.stringify(full));
