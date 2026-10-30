# Changelog

## Unreleased
- Every job message, reply, approval and new job records who sent it: you (your own Claude chat) or a named agent. Agents' messages reach a job marked as coming from an agent, never as you.
- Only you can approve a held action or answer a job waiting for your yes. Agents can still message each other and keep working.
- New, off by default: `--lead-agent NAME` lets one named agent approve for you. Its approvals are logged as that agent.
- Updating an older install adds the new columns to its job table.

## 0.9.0 (2026-10-29)
- One installer for macOS and Windows: `node install.mjs`, with `--dry-run` and `--uninstall`.
- Each install deploys its own Cloudflare connector, database and keys.
- 31 voice tools: jobs, threads, routines, schedules, approvals, digest, health check, emergency stop, command line and desktop control. 27 with the command line and desktop control turned off.
- The command line and desktop control (run_command, command_result, look_at_screen, use_computer) are on by default, the way the author runs it, with a plain warning in the installer, README, SECURITY.md and release notes. Turn them off with the installer's question or `--no-power-lanes`. `--power-lanes` still works and means on. With them off, the connector hides and refuses those tools and the worker and supervisor refuse their jobs and commands.
- Mac today, Windows next: the background worker runs on macOS only for now. The Windows worker is the next thing landing.
- README: what you need and what it costs, update, uninstall, key rotation, and how to get help.
