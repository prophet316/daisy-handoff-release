# Changelog

## 0.9.1
GitHub Actions was blocked on the account while 0.9.1 was made, so the CI lines below say what `installer.yml` is set up to run, not that it ran. Every test was run by hand on one Mac; nothing ran on Windows.

### Name
- New name: Nuff Said (was Daisy Handoff). The release zip is `nuff-said.zip`, and the installer suggests naming the connector "Nuff Said". Daisy is the default name of your assistant, the worker on your computer. The install folder (`~/Projects/NAME-handoff`), Cloudflare Worker and D1 database names, launch agent labels (`com.daisy.*`) and Windows startup file names are unchanged, so `--update`, `--rotate-keys` and `--uninstall` keep working on existing installs.

### Who sent it
- The connector records and enforces the real sender on every tool that starts, schedules, approves, replies, retries, cancels or changes jobs. Your own Claude chat is recognized as you by the Anthropic address range it calls from; anything else (an agent or job on your computer, or a script) is labeled as an agent. It's a check on where the call comes from, not a login, and SECURITY.md says what it can't tell apart.
- Agents can't approve, answer a job waiting for your yes, publish or share, use run_command, command_result, look_at_screen or use_computer, or undo stop everything. They can't retry, reply to or message a desktop or screen job either; the worker refuses such a run too. They can still start ordinary jobs, which run Claude Code with its command line, and what they start is marked as theirs, never as your approval. A run of a schedule or routine an agent saved is marked as that agent's.
- New, off by default: `--lead-agent NAME` lets one named agent approve and answer jobs waiting for your yes, logged as that agent. It can't approve sending a held email, and its approval never unlocks send, post, buy or charge for a desktop job, even when your own request allowed them or a restart left the job waiting. `--update --no-lead-agent` turns it off and removes its key from Cloudflare.
- A run an agent started, retried, replied to, messaged while it ran, or approved doesn't publish or share by itself; the publish waits for your own "publish it".
- Email recipients count only from your own words: not the title or details of a job an agent made, not a note an agent sent, and not a history line an agent's text tried to forge (history entries are one line each).

### Job output in your chat
- Tools that read jobs back (check_updates, list_jobs, get_job, find_job, read_job_files, list_threads, list_schedules, daily_digest, health_check, worker_status, run_command, command_result) return their text between `<job-output>` tags under a label that says it's untrusted job output, never instructions from you. Tools that act on a job (approve_job, cancel_job, retry_job, reply_to_job, publish_job, force_kill_job, and the "which one?" list any of them gives) put the same label first and quote the job's title, and a held email's sender, recipients and subject, the same way. A fence tag inside the text, including look-alikes made with other dashes, zero-width characters or full-width brackets, is taken out, and a job an agent made says so. The connector tells Claude never to run commands, approve, publish, resume or use the desktop because job text asks. It's an instruction to Claude, not a lock, and SECURITY.md says so.
- The job card shows a held email (who made the job, sender, recipients, subject and body) above its Approve button, and a list card gives such a job Open instead of Approve. The card's buttons name the job by id, never by its title, both in the message they send and in what they tell Claude.

### Desktop control and approvals
- The desktop gate's record of what it held, the job's lane and hook settings, and its message inbox live in `~/.NAME/runs/<job>`, outside the job folder, so a computer job can't widen what your yes unlocks or add a message in your voice. An approved run unlocks only what the gate held on the run before, and the approval card lists what the gate held, including on a second hold from a run you already approved.
- A charge is unlocked only by a purchase card the worker recorded outside the job folder. Every desktop run (approved, reply or retry) moves an old `purchase.json` aside, and a purchase card says its numbers are what the job read off the order page.
- A worker restart (an agent can ask for one) doesn't start a running desktop or screen job again by itself: it waits for your yes and says it may be partly done.
- Desktop control treats the Claude app and claude.ai as off-limits unless your request names them, and holds express checkout buttons ("Buy with 1-Click", "Pay with Link") as the charge step.
- A job's own Claude sessions start with `ENABLE_CLAUDEAI_MCP_SERVERS=false`, so they don't load the connectors in your Claude account, and jobs are refused the usual `cua-driver` and `composio` commands. Both are speed bumps a job can get around, and the docs say so.
- Mac: the installer builds the blue glow and assistant cursor helper with the Command Line Tools, for the Mac's own chip and macOS 13 or newer, and sets its path in the worker config. A failed build is a note; desktop control still works. The doctor says when the helper is missing.

### Keys and leaks
- `node install.mjs --rotate-keys`, in this order: deploys the connector code again from the install folder and removes any secret Nuff Said doesn't set (such as `OWNER_CIDRS`), so planted code never gets a new key; changes the connector key, so a leaked URL is locked out at once; lists every schedule, routine, running job and job waiting to run with who set each up, and asks whether to clear them; then changes the worker and lead agent keys and restarts the worker and supervisor. The worker key comes last so the worker isn't cut off while you read the list. Jobs you chose to stop stay stopped, and a running desktop or screen job waits for your yes. With no terminal it stops before changing anything. With `--no-start` it says to restart the worker and supervisor yourself. `--clear-schedules` clears them at any time.
- The leak steps in the installer, README and SECURITY.md apply whether or not the command line was on, because a code job has its own command line. They cover your Cloudflare sign-in, Claude sign-in, GitHub and other tokens, say that `logs/shell.log` alone can't be trusted, and end with a second `--rotate-keys` after the Cloudflare and Claude sign-outs, before you add the connector again.
- The docs say that your Cloudflare account is a key too: anyone who can deploy to your connector's Worker or change its database can run commands on your Mac.
- The redactor that cleans live reads also cleans the command line's output, the files and result stored when a job ends, the phone notification and a held email, and hides the connector key, connector URL and lead agent key. A held email that carried a key can't be sent. It catches exact copies only.

### Installer and updates
- The command line and desktop control are on by default. At the installer's question, Enter or yes means on and the question says so; "no", "nope", "nah", "no thanks" and "No." mean off; anything else is asked again, and three unclear answers leave it off. `--no-power-lanes` and `--power-lanes` set it without the question.
- Phone notifications are their own question and are off unless you say yes. The question says the bell uses a research-preview development channel and that Nuff Said answers Claude Code's "I am using this for local development" warning each time the bell starts. Enter, `--yes`, and an update from an install with no answer on record leave it off. `--bell` and `--no-bell` turn it on or off, also on an update. The bell answers its startup prompts only until Remote Control is up or for 90 seconds, then stops reading the session's screen.
- `node install.mjs --update` updates in place: same keys, connector URL, Worker and database, last time's answers, job folders, logs and worker settings. An update that stops partway is safe to run again and says that Cloudflare and the running worker still use your old settings until it finishes.
- With no terminal and no `--yes`, the installer stops at the first question instead of answering it, and `--yes` prints each answer it took. Conflicting flags stop before any question.
- New `--manual` for step 1 of MANUAL-INSTALL.md.
- Schedules and the times Claude reads out use your own time zone, taken from your computer at install; `--time-zone NAME` picks another. Before, they were always US Central Time.
- The installer marks the phone bell's folder as trusted in Claude Code, so the bell can start on a new Mac.
- The installer needs Node 22.13 or newer and says so before it starts. It refuses a real install on Windows, which isn't in this release (a dry run still works).

### Supervisor and requests
- The supervisor polls every 2 seconds while a job is queued or running, for a minute after a command, for 10 minutes after a stop or force kill, and while a job process is still alive, and every 15 seconds otherwise: about 14,400 Cloudflare requests a day idle (measured against a local test connector).
- run_command refuses, with nothing queued, only when the supervisor hasn't checked in for 45 seconds, and the connector rewrites the check-in once it's 10 seconds old, so an idle Mac isn't refused.

### Doctor and docs
- New `node doctor.mjs` (also `node install.mjs --doctor`): checks your computer and install for the common problems, says what to do about each, and saves a report with keys, URLs, emails and your user name removed. It only sends your key to the connector your install recorded as deployed. It handles manual installs, installs whose connector was never deployed, and uninstalled ones.
- The health check doesn't report the optional email alarm, or desktop control that's off or not installed, as problems.
- New TROUBLESHOOTING.md, MANUAL-INSTALL.md and an "Install problem" issue form. The README lists everything you need and what it costs, how to add the connector in Claude, how phone notifications use Remote Control, how to start things again after Stop everything, how to hear about updates and security fixes, and how Nuff Said compares with what's built into Claude.

### Tests
- `./test.sh gate` runs the desktop gate, host lane, command line switch, who-sent-it (`test/sender.mjs`), run state (`test/run-state.mjs`), supervisor poll (`test/poll.mjs`), time zone, shell lane, redaction, bell and bell prompt self-tests. `installer.yml` is set up to run the installer dry run, update and key change, and the time zone, redaction and bell prompt tests on macOS and Windows, plus `./test.sh gate` on macOS.
- `test/doctor-no-leak.mjs`, `test/update-resume.mjs` and `test/overlay-build.mjs` run from the release folder.

## 0.9.0 (2026-10-29)
- One installer for macOS and Windows: `node install.mjs`, with `--dry-run` and `--uninstall`.
- Each install deploys its own Cloudflare connector, database and keys.
- 31 voice tools: jobs, threads, routines, schedules, approvals, digest, health check, emergency stop, command line and desktop control. 27 with the command line and desktop control turned off.
- The command line and desktop control (run_command, command_result, look_at_screen, use_computer) are on by default, the way the author runs it, with a plain warning in the installer, README, SECURITY.md and release notes. Turn them off with the installer's question or `--no-power-lanes`. `--power-lanes` still works and means on. With them off, the connector hides and refuses those tools and the worker and supervisor refuse their jobs and commands.
- Mac today, Windows next: the background worker runs on macOS only for now. The Windows worker is the next thing landing.
- README: what you need and what it costs, update, uninstall, key rotation, and how to get help.
