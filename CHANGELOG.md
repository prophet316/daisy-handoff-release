# Changelog

## Unreleased
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
