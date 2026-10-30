# Changelog

## Unreleased
- Security: the connector now records and enforces the real sender on every tool that starts, schedules, approves, replies, retries, cancels or changes jobs. Agents (anything that isn't your own Claude chat, and isn't a lead agent you turned on) can't publish or share, run commands, look at or use your desktop, or undo stop everything. start_thread, continue_thread, look_at_screen and use_computer record who started the job. Schedules and routines record who saved them, and their runs are marked as that agent's, never as your saved approval. Cancels, force-kills, stops and schedule cancels say who asked. New test: `test/sender.mjs`.
- Security: `node install.mjs --rotate-keys` changes the connector, worker and lead agent keys, restarts the worker and supervisor, and lists every schedule, routine and waiting job with who set it up; `--clear-schedules` turns them all off.
- Security: the doctor only sends your key to the connector your install recorded as deployed, never to the dry run's placeholder address (`test/doctor-no-leak.mjs`).
- Security: desktop control treats the Claude app and claude.ai as off-limits unless your request names them, and holds express checkout buttons ("Buy with 1-Click", "Pay with Link") as the charge step.
- `node install.mjs --update` updates in place: same keys, same connector URL, same Worker and database, last time's answers, job folders, logs and worker settings.
- The doctor checks `.lead-agent-key` permissions, says "worker is running" instead of "checked in", and spots Claude Code's first-run screen in the bell session. The installer says so before the first slow wrangler download, and suggests clearing the clipboard after you paste the URL.
- Docs: what the approval stop enforces in code and what is an instruction to Claude; that Anthropic's address range, including the Claude API, counts as you; that a leaked URL means commands on your computer while the command line is on; that the bell uses Claude Code's research-preview channels with its developer flag; CuaDriver needs macOS 14; Dispatch and the new Claude experience in "Isn't this already built into Claude?"; one Mac line instead of a Windows column.
- Installer version 0.9.1.
- Every job message, reply, approval and new job records who sent it: you (your own Claude chat) or a named agent. Agents' messages reach a job marked as coming from an agent, never as you.
- Only you can approve a held action or answer a job waiting for your yes. Agents can still message each other and keep working.
- New, off by default: `--lead-agent NAME` lets one named agent approve for you. Its approvals are logged as that agent.
- Updating an older install adds the new columns to its job table.
- Schedules and the times Claude reads out use your own time zone, taken from your computer when you install. `--time-zone NAME` picks another. Before, they were always US Central Time.
- New `node doctor.mjs` (also `node install.mjs --doctor`): checks your computer and install for the common problems, says what to do about each, and saves a report with keys, URLs, emails and your user name removed. The installer copies it into your install folder.
- New TROUBLESHOOTING.md for the common failures, MANUAL-INSTALL.md for installing step by step, and an "Install problem" issue form.
- The installer now marks the phone bell's folder as trusted in Claude Code, so the bell can start on a new Mac, and lists the phone notification setup at the end.
- The installer needs Node 22 (the Cloudflare tool it uses needs 22), and says so before it starts.
- README: the full list of what you need (Command Line Tools, an administrator password, optional CuaDriver), how phone notifications use Remote Control, and how to open Terminal in the right folder.
- README rewritten to open with what it is inside Claude: features in plain words, each marked Mac and Windows, Mac only or Windows gap; a "Works everywhere Claude does" section citing Anthropic's help page; costs with sources; Remote Control and phone notifications in plain words; how to hear about updates and security fixes and how to update; the connector menu path for Team and Enterprise; Composio only for Google Docs, Drive and email.
- SECURITY.md: how to hear about security fixes. Release notes rewritten for 0.9.1.

## 0.9.0 (2026-10-29)
- One installer for macOS and Windows: `node install.mjs`, with `--dry-run` and `--uninstall`.
- Each install deploys its own Cloudflare connector, database and keys.
- 31 voice tools: jobs, threads, routines, schedules, approvals, digest, health check, emergency stop, command line and desktop control. 27 with the command line and desktop control turned off.
- The command line and desktop control (run_command, command_result, look_at_screen, use_computer) are on by default, the way the author runs it, with a plain warning in the installer, README, SECURITY.md and release notes. Turn them off with the installer's question or `--no-power-lanes`. `--power-lanes` still works and means on. With them off, the connector hides and refuses those tools and the worker and supervisor refuse their jobs and commands.
- Mac today, Windows next: the background worker runs on macOS only for now. The Windows worker is the next thing landing.
- README: what you need and what it costs, update, uninstall, key rotation, and how to get help.
