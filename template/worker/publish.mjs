// Publish a job's result to Google Docs or Drive, and share it, through the Composio CLI.
// Only the worker calls this, and only for publish/share fields {{OWNER}} set on the job; the agent never gets these tools.
// Every step is checked: which Google account is signed in, the file id that came back, and each share.

import { execFile } from "node:child_process";
import { writeFileSync, readFileSync, readdirSync, statSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { join, basename, isAbsolute } from "node:path";
import { tmpdir } from "node:os";

const DRIVE_MAX_FILES = 10;
const DRIVE_MAX_BYTES = 5 * 1024 * 1024; // Composio's GOOGLEDRIVE_UPLOAD_FILE limit

// Pull the JSON object out of the CLI output (it may print tips or color codes around it).
export function parseCli(out) {
  const clean = String(out).replace(/\x1b\[[0-9;]*m/g, "");
  const a = clean.indexOf("{"), b = clean.lastIndexOf("}");
  if (a < 0 || b < a) return null;
  try { return JSON.parse(clean.slice(a, b + 1)); } catch { return null; }
}

// A big answer (a long Google Doc echoes its whole body) is not printed: the CLI writes it to a temp file and prints
// only { storedInFile: true, outputFilePath }. Read the real answer from that file, then remove it (it holds the content).
export function loadStored(res, slug) {
  if (!res?.storedInFile) return res;
  const p = res.outputFilePath;
  if (typeof p !== "string" || !isAbsolute(p) || !p.endsWith(".json") || !basename(p).startsWith(`${slug}_OUTPUT`)) {
    return { ...res, error: `the CLI stored its answer in a file the worker does not recognise (${String(p).slice(0, 200)})` };
  }
  try { return JSON.parse(readFileSync(p, "utf8")); }
  catch (e) { return { ...res, error: `could not read the answer the CLI stored at ${p}: ${e.message}` }; }
  finally { rmSync(p, { force: true }); }
}

// First value found for any of these keys, searching nested objects.
export function dig(o, keys) {
  if (!o || typeof o !== "object") return undefined;
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && typeof o[k] !== "object") return o[k];
  for (const v of Object.values(o)) { const r = dig(v, keys); if (r !== undefined) return r; }
  return undefined;
}

export function makePublisher(cfg) {
  const bin = cfg.composioBin || `${process.env.HOME}/.composio/composio`;
  const timeout = (cfg.timeoutSeconds || 120) * 1000;

  function run(slug, data, file) {
    const dir = mkdtempSync(join(tmpdir(), "daisy-pub-"));
    const argsFile = join(dir, "args.json");
    writeFileSync(argsFile, JSON.stringify(data), { mode: 0o600 });
    // Pin the Composio connection per toolkit (e.g. googledrive -> my-drive) so a second Google login can't be picked.
    const pinned = (cfg.accounts || {})[slug.split("_")[0].toLowerCase()];
    const argv = ["execute", slug, "-d", `@${argsFile}`, ...(file ? ["--file", file] : []), ...(pinned ? ["--account", pinned] : [])];
    return new Promise((resolve) => {
      execFile(bin, argv, { timeout, maxBuffer: 10 * 1024 * 1024, env: { ...process.env, NO_COLOR: "1" } }, (err, stdout, stderr) => {
        rmSync(dir, { recursive: true, force: true });
        const res = loadStored(parseCli(stdout), slug);
        const ok = !err && res && res.successful !== false && !res.error;
        const why = res?.error ? (typeof res.error === "string" ? res.error : JSON.stringify(res.error)) : (stderr || err?.message || "no readable output").replace(/\x1b\[[0-9;]*m/g, "");
        resolve(ok ? { ok: true, res } : { ok: false, error: `${slug}: ${String(why).trim().slice(0, 300)}` });
      });
    });
  }

  async function account() {
    const r = await run("GOOGLEDRIVE_GET_ABOUT", { fields: "user(displayName,emailAddress)" });
    if (!r.ok) return r;
    const email = dig(r.res, ["emailAddress"]);
    const name = dig(r.res, ["displayName"]);
    if (!email && !name) return { ok: false, error: "GOOGLEDRIVE_GET_ABOUT returned no account" };
    return { ok: true, email: email ? String(email).toLowerCase() : null, name: name || null };
  }

  async function createDoc(title, markdown) {
    const r = await run("GOOGLEDOCS_CREATE_DOCUMENT_MARKDOWN", { title, markdown_text: markdown });
    if (!r.ok) return r;
    const id = dig(r.res, ["documentId", "document_id", "id"]);
    if (!id) return { ok: false, error: `Google Docs gave back no document id (answer keys: ${Object.keys(r.res || {}).join(", ")}). A doc titled "${title}" may still have been made; check Drive before publishing again` };
    return { ok: true, file: { name: title, kind: "google_doc", id: String(id), link: `https://docs.google.com/document/d/${id}/edit` } };
  }

  async function upload(path, name) {
    // --file hands the local file to the CLI, which fills file_to_upload (name and type) itself.
    const r = await run("GOOGLEDRIVE_UPLOAD_FILE", cfg.driveFolderId ? { folder_to_upload_to: cfg.driveFolderId } : {}, path);
    if (!r.ok) return r;
    const id = dig(r.res, ["id", "fileId", "file_id"]);
    if (!id) return { ok: false, error: `Drive gave back no file id for ${name} (answer keys: ${Object.keys(r.res || {}).join(", ")}). It may still have been uploaded; check Drive before publishing again` };
    const link = dig(r.res, ["webViewLink"]) || `https://drive.google.com/file/d/${id}/view`;
    return { ok: true, file: { name, kind: "drive_file", id: String(id), link: String(link) } };
  }

  async function share(fileId, s) {
    // CREATE_PERMISSION (not ADD_FILE_SHARING_PREFERENCE) so Google sends no "shared with you" email.
    const data = s.who === "anyone"
      ? { file_id: fileId, type: "anyone", role: s.role }
      : { file_id: fileId, type: "user", role: s.role, email_address: s.who, send_notification_email: false };
    const r = await run("GOOGLEDRIVE_CREATE_PERMISSION", data);
    return r.ok ? { ok: true } : r;
  }

  return { run, account, createDoc, upload, share };
}

// What to upload for google_drive: the job's publish/ folder, else OUTPUT.md. Hidden files are skipped.
export function driveFiles(jobDir) {
  const pub = join(jobDir, "publish");
  let paths = [];
  if (existsSync(pub)) paths = readdirSync(pub).filter((n) => !n.startsWith(".")).map((n) => join(pub, n)).filter((p) => statSync(p).isFile());
  else if (existsSync(join(jobDir, "OUTPUT.md"))) paths = [join(jobDir, "OUTPUT.md")];
  return paths;
}

// Do exactly what the job's publish and share fields say. Returns { record, lines, problems }.
// record goes back to the connector; lines are for {{OWNER}}; problems mean something {{HE}} asked for did not happen.
export async function publishJob(pub, job, jobDir, prior) {
  const publish = job.publish ? JSON.parse(job.publish) : null;
  const share = job.share_with ? JSON.parse(job.share_with) : null;
  const lines = [], problems = [];
  const record = { account: prior?.account || null, files: [...(prior?.files || [])], shared: [...(prior?.shared || [])] };

  const acct = await pub.account();
  if (!acct.ok) {
    problems.push(`Could not reach Google through Composio (${acct.error}). {{OWNER}} may need to run composio login.`);
    return { record: prior || null, lines, problems };
  }
  const who = acct.email || acct.name;
  if (pub.expectAccount && acct.email !== String(pub.expectAccount).toLowerCase()) {
    problems.push(`Composio is signed in to Google as ${who}, not ${pub.expectAccount}, so nothing was published.`);
    return { record: prior || null, lines, problems };
  }
  record.account = who;

  let made = [];
  if (publish) {
    if (publish.to === "google_doc") {
      const src = join(jobDir, "OUTPUT.md");
      if (!existsSync(src)) problems.push("Asked for a Google Doc, but the job made no OUTPUT.md, so nothing was published.");
      else {
        const r = await pub.createDoc(publish.title, readFileSync(src, "utf8"));
        r.ok ? made.push(r.file) : problems.push(r.error);
      }
    } else if (publish.to === "google_drive") {
      const paths = driveFiles(jobDir);
      if (!paths.length) problems.push("Asked to upload to Drive, but the job put no files in publish/ and made no OUTPUT.md.");
      if (paths.length > DRIVE_MAX_FILES) problems.push(`Only the first ${DRIVE_MAX_FILES} files in publish/ were uploaded.`);
      for (const p of paths.slice(0, DRIVE_MAX_FILES)) {
        if (statSync(p).size > DRIVE_MAX_BYTES) { problems.push(`${basename(p)} is over 5 MB, so it was not uploaded.`); continue; }
        const r = await pub.upload(p, basename(p));
        r.ok ? made.push(r.file) : problems.push(r.error);
      }
    }
    record.files.push(...made);
    for (const f of made) lines.push(`Published ${f.name} to ${f.kind === "google_doc" ? "Google Docs" : "Google Drive"} as ${who}: ${f.link}`);
  }

  if (share) {
    // Share what this run published; a share-only request shares what the job published before.
    const targets = made.length ? made : (prior?.files || []);
    if (!targets.length) problems.push("Nothing was published, so nothing was shared.");
    for (const f of targets) for (const s of share) {
      const r = await pub.share(f.id, s);
      if (r.ok) { record.shared.push({ file: f.id, who: s.who, role: s.role }); lines.push(`Shared ${f.name} with ${s.who === "anyone" ? "anyone with the link" : s.who} (${s.role}).`); }
      else problems.push(`Sharing ${f.name} with ${s.who} failed: ${r.error}`);
    }
  }
  return { record, lines, problems };
}
