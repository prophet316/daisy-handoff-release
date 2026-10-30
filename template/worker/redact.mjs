// Redaction for what leaves the Mac in a live read: job files, PROGRESS.md/JARVIS.md and log lines.
// Known secret values (the worker and bell keys, secret-looking env vars) are always replaced, and so are common token shapes.
// Logs also lose any long random-looking string, since a log line has no reason to carry one.
// Usage: node worker/redact.mjs --selftest

const MARK = "[redacted]";

const PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /\bsk-(?:ant-)?[A-Za-z0-9_-]{16,}/g,                    // Anthropic / OpenAI style
  /\b(?:ghp|gho|ghs|ghu|ghr)_[A-Za-z0-9]{20,}|\bgithub_pat_[A-Za-z0-9_]{20,}/g,
  /\bxox[abposr]-[A-Za-z0-9-]{10,}/g,                     // Slack
  /\bAKIA[0-9A-Z]{16}\b/g,                                // AWS access key id
  /\bAIza[0-9A-Za-z_-]{30,}/g,                            // Google API key
  /\bya29\.[0-9A-Za-z_-]{20,}/g,                          // Google OAuth access token
  /\bre_[A-Za-z0-9_]{16,}/g,                              // Resend
  /\bak_[A-Za-z0-9_-]{16,}/g,                             // Composio
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, // JWT
];
// name=value, name: value, "name": "value", Authorization: Bearer x. The name stays so the line still reads.
const NAMED = /((?:authorization|bearer|password|passwd|secret|token|api[_-]?key|apikey|access[_-]?key|client[_-]?secret|private[_-]?key|cookie|session[_-]?key|[A-Z0-9_]*(?:_KEY|_TOKEN|_SECRET|_PASSWORD))["']?\s*(?:[:=]|\s)\s*["']?)(?:bearer\s+)?([^\s"',;]{6,})/gi;
// Mixed case plus digits, 32+ characters (keys and tokens; file names and paths are lower case), or 40+ hex digits in a row.
const LONG = /(?<![A-Za-z0-9+_=-])(?=[A-Za-z0-9+_=-]*[0-9])(?=[A-Za-z0-9+_=-]*[a-z])(?=[A-Za-z0-9+_=-]*[A-Z])[A-Za-z0-9+_=-]{32,}|(?<![0-9a-fA-F])[0-9a-fA-F]{40,}(?![0-9a-fA-F])/g;

export function makeRedactor(secrets = []) {
  const known = [...new Set(secrets.map((s) => String(s || "").trim()).filter((s) => s.length >= 8))].sort((a, b) => b.length - a.length);
  return (text, { log = false } = {}) => {
    let t = String(text ?? "");
    for (const s of known) t = t.split(s).join(MARK);
    for (const p of PATTERNS) t = t.replace(p, MARK);
    t = t.replace(NAMED, (m, name, value) => (value === MARK ? m : `${name}${MARK}`));
    if (log) t = t.replace(LONG, MARK);
    return t;
  };
}

// Secret-looking values from the environment the worker runs in.
export function envSecrets(env = process.env) {
  return Object.entries(env).filter(([k, v]) => /KEY|TOKEN|SECRET|PASSWORD|PASSWD|COOKIE/i.test(k) && v && v.length >= 8).map(([, v]) => v);
}

// File names that are never sent, whatever folder they are in.
export const SECRET_NAME = /^\.env(\..*)?$|\.(pem|key|p12|pfx|keychain(-db)?)$|^id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$|(^|[._-])(secrets?|credentials?)([._-]|$)|^\.?(worker|bell|connector)-key/i;

if (process.argv.includes("--selftest")) {
  const r = makeRedactor(["local-worker-key-1234567890"]);
  const cases = [
    ["the worker key", "auth local-worker-key-1234567890 ok", (o) => !o.includes("local-worker-key")],
    ["Anthropic key", "key sk-ant-api03-abcdefghijklmnopqrstuvwx", (o) => !o.includes("abcdefghijklmnop")],
    ["GitHub token", "ghp_abcdefghijklmnopqrstuvwxyz0123", (o) => !o.includes("ghp_abc")],
    ["Resend key", "RESEND re_AbCdEf1234567890xyz", (o) => !o.includes("re_AbCd")],
    ["Bearer header", "Authorization: Bearer abc123def456ghi", (o) => !o.includes("abc123def456") && o.includes("Authorization")],
    ["name=value", "export API_KEY=hunter2hunter2", (o) => !o.includes("hunter2") && o.includes("API_KEY")],
    ["JSON token", '{"token": "zzzzyyyyxxxx1111"}', (o) => !o.includes("zzzzyyyy")],
    ["password in text", "password: Tr0ub4dor&3", (o) => !o.includes("Tr0ub4dor")],
    ["private key block", "-----BEGIN OPENSSH PRIVATE KEY-----\nAAAA\n-----END OPENSSH PRIVATE KEY-----", (o) => !o.includes("AAAA")],
    ["JWT", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U", (o) => !o.includes("eyJhbGci")],
    ["long random string in a log", "got q8Zr2LkPw0aVtY7nB3mXc5sD1fGh4jK6lQ9eR0tU", (o) => o === "got [redacted]", { log: true }],
    ["plain text untouched", "job 1a2b3c4d started (fresh, code): Write the PROGRESS notes", (o) => o === "job 1a2b3c4d started (fresh, code): Write the PROGRESS notes", { log: true }],
    ["paths and log names untouched", "in {{HOME}}/Projects/jarvis4c-testproj logs/jarvis4b-test-final2-20261022-120610.log", (o) => !o.includes(MARK), { log: true }],
    ["40 hex digits in a log", "commit 3e172b5c0f9e8d7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c done", (o) => o === "commit [redacted] done", { log: true }],
    ["timestamps untouched", "2026-10-22T17:28:58.280Z job 283942b7 done", (o) => o === "2026-10-22T17:28:58.280Z job 283942b7 done", { log: true }],
    ["file names untouched in notes", "D1 bookmark 00000004-0000002f-0000510c-5619230e51157c31d9a94fc7aa34241b", (o) => o.includes("00000004-0000002f")],
  ];
  const names = [[".env", true], [".env.local", true], ["server.pem", true], ["id_ed25519", true], ["aws-credentials.json", true], ["secrets.txt", true], [".worker-key", true],
    ["RESULT.md", false], ["PROGRESS.md", false], ["keynote-notes.md", false], ["monkey.txt", false]];
  let fail = 0;
  for (const [name, input, ok, opt] of cases) { const out = r(input, opt); const good = ok(out); if (!good) fail++; console.log(`${good ? "PASS" : "FAIL"}  ${name}${good ? "" : ` -> ${out}`}`); }
  for (const [n, secret] of names) { const good = SECRET_NAME.test(n) === secret; if (!good) fail++; console.log(`${good ? "PASS" : "FAIL"}  name ${n} ${secret ? "withheld" : "kept"}`); }
  console.log(`${cases.length + names.length - fail}/${cases.length + names.length} passed`);
  process.exit(fail ? 1 : 0);
}
