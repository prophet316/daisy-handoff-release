// Approved email: the agent only drafts (email-draft.json); the worker checks the draft against {{OWNER}}'s own words,
// holds it for {{HIS}} yes, and after approve_job sends exactly that draft, once, through Composio Gmail.
// Accounts: worker config gmail.accounts maps each sending address to its Composio Gmail account id.

import { readFileSync, existsSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { parseCli, dig } from "./publish.mjs";

const EMAIL = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[a-z]{2,}$/i;
const MAX_RECIPIENTS = 10;

export function readDraft(dir) {
  const f = join(dir, "email-draft.json");
  if (!existsSync(f)) return null;
  try { return { draft: JSON.parse(readFileSync(f, "utf8")) }; } catch (e) { return { draft: null, error: `email-draft.json is not valid JSON (${e.message}).` }; }
}

const list = (v) => (Array.isArray(v) ? v : typeof v === "string" && v ? [v] : []).map((a) => String(a).trim().toLowerCase()).filter(Boolean);

function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

// Which account {{OWNER}}'s own words name to send from: an address, a Composio account id, or a plain phrase.
export function namedAccount(words, accounts) {
  const named = new Set();
  for (const [addr, acct] of Object.entries(accounts)) {
    if (words.toLowerCase().includes(acct.toLowerCase())) named.add(addr);
    const esc = addr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b(from|send(?:ing)? as|using|via|with)\\s+(my\\s+)?${esc}`, "i").test(words)) named.add(addr);
  }
  if (/\bfrom (my )?(personal (e-?mail|gmail|account)|gmail( account)?)\b/i.test(words)) named.add(Object.keys(accounts).find((a) => a.endsWith("@gmail.com")));
  named.delete(undefined);
  // One sending account: it is the only one {{OWNER}} can mean (the draft is still held for {{HIS}} yes).
  if (!named.size && Object.keys(accounts).length === 1) named.add(Object.keys(accounts)[0]);
  return [...named];
}

// The held record: exactly what will be sent, plus every reason it can't be sent as drafted.
export function checkDraft(draft, words, accounts) {
  const from = String(draft.from || "").trim().toLowerCase();
  const held = {
    kind: "email", from, account: accounts[from] || null,
    to: list(draft.to), cc: list(draft.cc), bcc: list(draft.bcc),
    subject: String(draft.subject || "").slice(0, 500), body: String(draft.body || "").slice(0, 50_000), problems: [],
  };
  const choices = Object.entries(accounts).map(([a, c]) => `${a} (${c})`).join(" or ");
  const named = namedAccount(words, accounts);
  if (named.length !== 1) held.problems.push(named.length ? `{{OWNER}}'s request names more than one account to send from (${named.join(", ")}); ask which one.` : `{{OWNER}} didn't say which account to send from: ${choices}? Ask {{HIM}}.`);
  else if (from && from !== named[0]) held.problems.push(`The draft is from ${from}, but {{OWNER}} asked to send from ${named[0]}.`);
  if (!from) { if (named.length === 1) { held.from = named[0]; held.account = accounts[named[0]]; } }
  else if (!held.account) held.problems.push(`${from} is not one of {{OWNER}}'s sending accounts (${choices}).`);
  const all = [...held.to, ...held.cc, ...held.bcc];
  if (!held.to.length) held.problems.push("The draft has no recipient.");
  if (all.length > MAX_RECIPIENTS) held.problems.push(`More than ${MAX_RECIPIENTS} recipients.`);
  if (!held.subject && !held.body) held.problems.push("The draft has no subject or body.");
  // Recipient spelling: every address must appear exactly in {{OWNER}}'s own words.
  const inWords = [...new Set((words.toLowerCase().match(/[^\s@,;<>"'()]+@[^\s@,;<>"'()]+\.[a-z]{2,}/g) || []).map((a) => a.replace(/[.]+$/, "")))];
  for (const a of all) {
    if (!EMAIL.test(a)) { held.problems.push(`"${a}" is not a valid email address.`); continue; }
    if (inWords.includes(a)) continue;
    const near = inWords.map((w) => [w, editDistance(a, w)]).sort((x, y) => x[1] - y[1])[0];
    held.problems.push(near && near[1] <= 3 ? `${a} is not in {{OWNER}}'s request; did {{HE}} mean ${near[0]}? Check the spelling with {{HIM}}.` : `${a} is not an address {{OWNER}} gave; check it with {{HIM}}.`);
  }
  return held;
}

export function draftHash(h) {
  const canon = JSON.stringify([h.account, h.from, h.to, h.cc, h.bcc, h.subject, h.body]);
  return createHash("sha256").update(canon).digest("hex").slice(0, 32);
}

// One GMAIL_SEND_EMAIL call through the pinned account. Returns { ok, message_id } or { ok: false, error }.
export function sendHeldEmail(bin, h, timeoutMs = 120_000) {
  const dir = mkdtempSync(join(tmpdir(), "daisy-mail-"));
  const argsFile = join(dir, "args.json");
  writeFileSync(argsFile, JSON.stringify({
    recipient_email: h.to[0], extra_recipients: h.to.slice(1), cc: h.cc, bcc: h.bcc, subject: h.subject, body: h.body, is_html: false, user_id: "me",
  }), { mode: 0o600 });
  return new Promise((resolve) => {
    execFile(bin, ["execute", "GMAIL_SEND_EMAIL", "-d", `@${argsFile}`, "--account", h.account], { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024, env: { ...process.env, NO_COLOR: "1" } }, (err, stdout, stderr) => {
      rmSync(dir, { recursive: true, force: true });
      const res = parseCli(stdout);
      const ok = !err && res && res.successful !== false && !res.error;
      const why = res?.error ? (typeof res.error === "string" ? res.error : JSON.stringify(res.error)) : (stderr || err?.message || "no readable output");
      resolve(ok ? { ok: true, message_id: dig(res, ["id", "messageId", "message_id"]) || null } : { ok: false, error: `GMAIL_SEND_EMAIL: ${String(why).replace(/\x1b\[[0-9;]*m/g, "").trim().slice(0, 300)}` });
    });
  });
}
