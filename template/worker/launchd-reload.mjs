// launchd keeps the job definition it loaded: when a plist changes (say, a new Node), a plain restart (KeepAlive after
// exit, kickstart) still runs the old program. At startup, before it claims anything, a launchd-run worker compares its
// own Node with the one its plist names; if they differ it reloads its launchd job once (bootout, then bootstrap from a
// detached helper in its own process group, which survives the bootout) and waits to be replaced.
// At most one try per 15 minutes (stamp file), so a broken plist can't make it loop; if nothing happens within a minute,
// the caller carries on with the old Node.

import { readFileSync, writeFileSync, statSync, realpathSync, appendFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";

export function staleLaunchd({ label = process.env.XPC_SERVICE_NAME, home = homedir(), execPath = process.execPath } = {}) {
  if (!label || !/^com\.daisy\.[\w.-]+$/.test(label)) return null; // not run by launchd as one of ours
  const plist = join(home, "Library", "LaunchAgents", `${label}.plist`);
  let want;
  try { want = /<key>ProgramArguments<\/key>\s*<array>\s*<string>([^<]+)<\/string>/.exec(readFileSync(plist, "utf8"))?.[1]; } catch { return null; }
  if (!want) return null;
  try { if (realpathSync(want) === realpathSync(execPath)) return null; } catch { return null; }
  return { label, plist, want, have: realpathSync(execPath) };
}

// Starts the reload; returns false if one was tried too recently.
export function reloadLaunchd(stale, { stampFile, logFile, uid = process.getuid() }) {
  try { if (Date.now() - statSync(stampFile).mtimeMs < 15 * 60_000) return false; } catch {}
  writeFileSync(stampFile, new Date().toISOString());
  const q = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;
  const svc = `gui/${uid}/${stale.label}`;
  const sh = [
    `echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) launchd reload of ${stale.label}: ${stale.have} -> ${stale.want}"`,
    "sleep 2", `launchctl bootout ${svc}`, "sleep 3",
    `for i in 1 2 3; do launchctl bootstrap gui/${uid} ${q(stale.plist)} && break; sleep 5; done`,
    `launchctl print ${svc} | grep -E "^\\s*(program|state) =" | sed "s/^/  reloaded: /"`,
  ].join("\n");
  appendFileSync(logFile, "");
  spawn("/bin/sh", ["-c", `{\n${sh}\n} >> ${q(logFile)} 2>&1`], { detached: true, stdio: "ignore" }).unref();
  return true;
}
