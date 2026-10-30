# Daisy Handoff

[![Latest release](https://img.shields.io/github/v/release/prophet316/daisy-handoff-release)](https://github.com/prophet316/daisy-handoff-release/releases/latest)
[![Installer CI](https://github.com/prophet316/daisy-handoff-release/actions/workflows/installer.yml/badge.svg)](https://github.com/prophet316/daisy-handoff-release/actions/workflows/installer.yml)
[![License: FSL-1.1-MIT](https://img.shields.io/badge/license-FSL--1.1--MIT-blue)](LICENSE)

**Talk to Claude. Your computer does the work. You never leave Claude.**

Daisy Handoff is built to be native to the Claude app you already use. It's one custom connector you add in Claude. After that, a conversation with Claude, including a live voice conversation on your phone, can hand real work to Claude Code on your own computer: start jobs, check on them, approve, schedule, and stop everything. Claude's voice, your chats and your other connectors stay exactly as they are. Daisy is the worker on your computer that picks up each job.

Mac today. Windows is in testing and isn't in this release. An independent project, not made or endorsed by Anthropic.

> [!WARNING]
> **Read this first.** Daisy Handoff ships with the command line and desktop control turned on, the way the author uses it. That means a job can do anything you can do at your keyboard: run commands, change or delete files, open apps, and click and type on your desktop, using your logins. A leaked connector URL or a prompt injection in a web page or email could cause real damage. Sends, posts, spending, deletes and access changes stop for your yes unless you asked for them. That lowers the risk but doesn't remove it. To turn it off, answer no to the installer's question or run it with `--no-power-lanes`. Turning it off is not a sandbox: normal Claude Code jobs still run. Install it only on a computer you trust it with. Desktop control is Mac only for now.

<!-- TODO(SCREENSHOTS_PLAN H1): hero clip readme/hero.mp4, poster readme/hero-poster.png. Caption: "One voice request, start to finish." -->

---

## What you can say

- "Have a worker clean up my downloads folder and tell me when it's done."
- "Start a thread called podcast site and rebuild the episode page."
- "What's running right now?"
- "What did the finances job find?"
- "Approve it." / "Retry it, but skip the old files."
- "Every weekday at 7, send me a news brief."
- "Stop everything."

31 tools out of the box: jobs, threads, routines, schedules, approvals, a daily digest, a health check, an emergency stop, and the command line and desktop control. With the command line and desktop control turned off, it's 27.

<!-- TODO(SCREENSHOTS_PLAN S6): readme/06-whats-running.png, the "What's running" answer in the Claude app. -->

---

## What you need

Everything here is listed before you start, with what it costs.

| What | Cost | Notes |
| ---- | ---- | ----- |
| A Mac on macOS 13 (Ventura) or newer | | macOS 13 is the oldest version Claude Code supports. Tested on macOS 26. |
| A paid Claude plan: Pro, Max, Team or Enterprise | Pro is $20 a month ($17 a month billed yearly); Max starts at $100 a month ([Claude pricing](https://claude.com/pricing)) | Claude Code is in every paid plan and not in Free, so Free can't run the jobs. Custom connectors and voice mode work on every plan. On Team and Enterprise, an Owner adds the connector under **Organization settings > Connectors**, and turns on Remote Control and channels in [Claude Code admin settings](https://claude.ai/admin-settings/claude-code) for phone notifications. |
| Claude Code, installed and signed in on the Mac | Included with the plan | Install it from [claude.ai/code](https://claude.ai/code), run `claude`, and type `/login`. Sign in with your Claude plan, not an API key. If `claude` says command not found, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md#claude-command-not-found). |
| The Claude app on your phone | Free | For voice and job notifications. Signed in to the same Claude account. |
| Node 22 or newer | Free | From [nodejs.org](https://nodejs.org) (the LTS download). The Cloudflare tool the installer uses needs Node 22. |
| Apple's Command Line Tools | Free | The phone bell uses the Python that comes with them. Many Macs have them already; if not, run `xcode-select --install`. |
| Your Mac's administrator password | | The Node and Command Line Tools installers ask for it. |
| A Cloudflare account | Free plan is enough | The free Workers plan allows 100,000 requests a day, and its free D1 database allows 5 million rows read and 100,000 rows written a day ([Cloudflare pricing](https://developers.cloudflare.com/workers/platform/pricing/)). Your computer checks in every 20 seconds, about 4,300 requests a day. |
| CuaDriver (optional) | Free | Only for jobs that click and type on your desktop. See [TROUBLESHOOTING.md](TROUBLESHOOTING.md#desktop-control-doesnt-work). Everything else works without it. |
| A [Composio](https://composio.dev) account (optional) | See Composio | Only for publishing a job's result to Google Docs or Drive and for sending email. Everything else works without it. |

---

## Features

Today every feature runs on the Mac. The marks show where Windows stands: the Windows worker is in testing and isn't in this release.

- **Mac and Windows:** works on the Mac, and the Windows worker in testing has it too.
- **Mac only:** no Windows version.
- **Windows gap:** the Windows worker has it with a difference, or it hasn't been tested on Windows yet.

### Hand off work while you talk

| Feature | What it does for you | Where |
|---|---|---|
| Hand off a job | Say what you want done and it goes to Claude Code on your computer. The idea turns into work without stopping the conversation. | Mac and Windows |
| Ongoing threads | Start a named project and keep giving it the next task. It picks up where it left off. | Mac and Windows |
| Several jobs at once | Up to 3 jobs run side by side out of the box. | Mac and Windows |
| Change a job while it runs | "Add a summary at the end" reaches a running job. Steer it without starting over. | Mac and Windows |
| Try again | "Retry it, but skip the old files." | Mac and Windows |
| Find a job by describing it | "What did the finances job find?" works without job numbers. | Mac and Windows |

### Stay in the loop

| Feature | What it does for you | Where |
|---|---|---|
| What's new | At the start of a chat, Claude tells you what finished or needs you since you last heard. | Mac and Windows |
| What's running | Ask from any Claude chat and hear every job and its status. | Mac and Windows |
| Read what a job made | Claude reads the files a job made, or a live view of one still running. | Mac and Windows |
| Phone notification when a job is done | Your phone gets a Claude app notification with the result. See [Phone notifications and Remote Control](#phone-notifications-and-remote-control). | Windows gap: not tested on a real PC yet |
| Daily digest | One short summary of the day, at a time you pick. | Windows gap: uses the same phone notification |
| Health check | One question tells you whether the worker, phone bell, sign-ins and disk space are fine. | Windows gap: not tested on Windows yet |

### You stay in charge

| Feature | What it does for you | Where |
|---|---|---|
| Asks before it acts | Sending, posting, spending, deleting and access changes stop and wait for your yes, unless your request asked for them. It lowers the risk; it doesn't remove it. | Mac and Windows |
| Only you can say yes | Your own Claude chat is recognized as you. Agents and scripts on your computer are labeled as agents and can't approve for you. | Mac and Windows (this check runs on your connector, not your computer) |
| Stop everything | Two words halt every running job and pause the queue and schedules. | Mac and Windows |
| Force-stop and restart | Stops a stuck job and everything it started, or restarts the worker, even if the worker is frozen. | Mac and Windows |
| Off switch for the powerful parts | Answer no at install, or use `--no-power-lanes`, and the command line and desktop control are gone. Not a sandbox: normal Claude Code jobs still run. | Mac and Windows |

<!-- TODO(SCREENSHOTS_PLAN S3): readme/03-approval-phone.png, Claude on the phone asking before it sends. Caption must keep: "Asking first lowers the risk. It does not remove it." -->

### Schedules and routines

| Feature | What it does for you | Where |
|---|---|---|
| Schedules | "Every weekday at 7, send me a news brief." Once, daily, weekdays or weekly, in your own time zone. | Mac and Windows |
| Routines | Save a few steps as a routine ("my morning routine") and run it by name or on a schedule. | Mac and Windows |

### Hands on your computer (on by default, see the warning above)

| Feature | What it does for you | Where |
|---|---|---|
| Run a command | Quick commands from the conversation, like what's running or git status. It always refuses root (sudo), disk erases, reading saved passwords and changing macOS security settings. | Mac and Windows (Windows uses PowerShell) |
| Look at the screen | Claude takes a screenshot and answers a question like "is the export finished?" | Mac and Windows |
| Use the computer | Claude opens apps and pages, clicks and types, and reports back. It waits while you're using the mouse or keyboard, stays out of Terminal, System Settings, Keychain Access and password managers unless you name them, and stops before money is charged. | Windows gap: no glow or Daisy cursor, and the PC has to be unlocked |
| Watch it work | A soft blue glow at the screen edges and Daisy's own cursor show where Claude is working. It never moves your pointer. | Mac only |

<!-- TODO(SCREENSHOTS_PLAN S5): readme/05-glow.png, blue glow and Daisy cursor mid-run. Caption: "Mac only." -->

### Private by design

| Feature | What it does for you | Where |
|---|---|---|
| Your own connector | The installer puts your connector and its database on your own free Cloudflare account. No shared server, so nobody else sees your jobs, including the author. | Mac and Windows |
| No open ports | Your computer reaches out; nothing reaches in. | Mac and Windows |
| Keys made on your computer | Three random keys, readable only by you, never printed or logged. | Mac and Windows |
| Change a leaked key | If your connector URL leaks, five Terminal lines make a new one. | Mac only as written (the steps use Mac commands) |

### Setup and upkeep

| Feature | What it does for you | Where |
|---|---|---|
| One installer | `node install.mjs`, four questions, a Cloudflare sign-in, then paste a link into Claude. | Mac and Windows (the installer runs on both) |
| Preview first | `--dry-run` shows everything it would do and deploys nothing. | Mac and Windows |
| Doctor | `node doctor.mjs` finds common problems, says what to do, and saves a report with your keys removed. | Windows gap: not tested on Windows yet |
| Starts by itself | The worker starts at login and comes back after a crash. | Mac and Windows |
| Clean uninstall | Removes everything, on your computer and on Cloudflare. | Windows gap: the steps below are Mac commands |
| Works with your other connectors | Calendar, mail and every other connector you use still work in the same chat. | Not tied to a computer |
| Publish to Google Docs or Drive, send email | A finished job can publish or share its result, or send an email you approved. Needs a Composio account. | Mac and Windows |

### Mac only, for now

- The background worker in this release. The Windows worker is in testing.
- Watching Claude work: the blue glow and Daisy cursor.
- Phone notifications, tested on the Mac only so far.
- The uninstall and key change steps, which use Mac commands.

---

## Works everywhere Claude does

Your connector lives in your Claude account, not on one device. Anthropic's help page says a custom connector you set up works "across every Claude client, including claude.ai, Claude Desktop, Cowork, and the mobile apps" ([Get started with custom connectors using remote MCP](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)). So the jobs you start by voice on your phone are the same jobs you see from the Claude app on your computer or from claude.ai in a browser. The author uses it from the Claude phone app and has checked it in Claude Duet chats.

---

## How it works

```
You (voice or chat, Claude app)
   -> Claude
   -> your connector (a Cloudflare Worker on YOUR free Cloudflare account)
   -> job queue
   <- worker on your computer checks in every 20 seconds
   -> Claude Code does the work, then you get a notification
```

Your computer never opens a port. The worker reaches out to your connector; nothing reaches in. Every install has its own connector, its own database and its own keys. Nobody else's computer sees your jobs, including mine.

Jobs run while your Mac is on and you're logged in. One install per Mac user account.

### Phone notifications and Remote Control

**Remote Control** is a Claude Code feature from Anthropic. It links a Claude Code session running on your computer to the Claude app on your phone, so that session can talk to you there. Anthropic explains it on the [Remote Control page](https://code.claude.com/docs/en/remote-control).

Daisy Handoff uses it for one thing: notifications. The installer starts one Claude Code session on your Mac with Remote Control on, and keeps it running. You may see it in the Claude app as "Daisy bell" (or your assistant's name). Leave it running. When a job finishes, the worker tells that session, and the session sends your phone a notification through the Claude app.

<!-- TODO(SCREENSHOTS_PLAN S4): readme/04-done-push.png, a Claude app notification on the lock screen with the job's real result. -->

For that to work:

- The Claude app on your phone is signed in to the same account as Claude Code on your Mac.
- Notifications are allowed for the Claude app on your phone.
- Claude Code is signed in with your Claude plan, not an API key. Remote Control doesn't work with API keys.
- Push is on in Claude Code: run `claude`, type `/config`, turn on **Push when Claude decides**, then `/exit`.
- On Team and Enterprise, an Owner has turned on Remote Control and channels.

Notifications are the only part that needs Remote Control. Starting and checking jobs works without it.

---

## Before you install: what you're giving it

- **Treat the connector URL and its key like a password.** Anyone who has the URL can give your computer work. The key is the long part near the end of the URL. It's saved in `.connector-url` and `.connector-key` in your install folder, readable only by you. Keep both out of screenshots, screen recordings, chats, issues and bug reports.
- **Jobs run as you.** A job runs Claude Code with your files and your sign-ins. Install it on a computer you're comfortable trusting it with.
- **The command line and desktop control are on by default.** Claude can run shell commands on your computer from the conversation, take screenshots of your screen, and click and type on your desktop. To turn them off, answer no to the installer's question or run it with `--no-power-lanes`. Off, those tools are hidden from Claude and your computer refuses them too. Turning them off is not a sandbox: code and design jobs still run Claude Code with its normal tools, including its own command line, inside the folders you send them to. If you already installed, run `node install.mjs --uninstall`, then `node install.mjs --force --no-power-lanes`. That makes a new connector URL, so add the connector in Claude again.
- **Send, post, spend and delete need your yes.** Jobs stop and ask before any of those unless your request asked for it.
- **Only you can give that yes.** Every message, reply and approval records who sent it. Your own Claude chat reaches the connector from Anthropic's servers, so it's recognized as you; anything else that holds the URL, like an agent or job on your computer, is labeled as an agent and can't approve for you or answer a job that's waiting for your yes. Agents can still message each other and keep working.
- **Letting a lead agent approve for you is off.** `--lead-agent NAME` turns it on for one named agent. Its approvals are logged as that agent, never as you. The catch: it proves itself with a key file, `.lead-agent-key`, and any job on your computer can read that file, so a job that was tricked by a web page or email could approve for you too. Leave it off unless you need it.

Read [SECURITY.md](SECURITY.md) for the details.

---

## Install (Mac)

1. Download **[daisy-handoff.zip](https://github.com/prophet316/daisy-handoff-release/releases/latest/download/daisy-handoff.zip)** and unzip it.
2. Open Terminal (Applications > Utilities > Terminal), go to the folder, and run the installer:
   ```bash
   cd ~/Downloads/daisy-handoff
   node install.mjs
   ```
   It checks Node and Claude Code first and tells you exactly what's missing.
3. Answer four questions (your name, what you call your assistant, what you call this computer, and whether jobs may use the command line and control your desktop; the answer is yes unless you type no).
4. Sign in to Cloudflare when your browser opens.
5. In Claude, go to **Customize > Connectors**, click **+**, choose **Add custom connector**, and paste the URL the installer copied for you. On Team and Enterprise, an Owner does this under **Organization settings > Connectors**.
6. Open the Claude app, start voice, and say: **"Daisy, check updates."** (or whatever you named your assistant)
7. For a notification on your phone when a job finishes: allow notifications for the Claude app on your phone, then on the Mac run `claude`, type `/config`, turn on **Push when Claude decides**, and type `/exit`.

<!-- TODO(SCREENSHOTS_PLAN S1): readme/01-installer.png, the installer after the four questions and the "copied" line. No URL visible. -->
<!-- TODO(SCREENSHOTS_PLAN S2): readme/02-connector.png, the Add custom connector dialog with a dummy URL. -->

Something not working? Run `node doctor.mjs` in the same folder. It finds the common problems and says what to do; [TROUBLESHOOTING.md](TROUBLESHOOTING.md) explains each one. If the installer keeps failing, [MANUAL-INSTALL.md](MANUAL-INSTALL.md) does the same steps one at a time.

To see everything it would do first, run `node install.mjs --dry-run`. It builds the install in a throwaway folder and deploys nothing.

Your install lives in `~/Projects/daisy-handoff` (the name follows what you call your assistant, so an assistant called Max lives in `~/Projects/max-handoff`). Your connector on Cloudflare has the same name, and its database adds `-jobs` to it.

**Good to know:**
- Schedules and times use your Mac's time zone, which the installer shows. To use another one, add `--time-zone America/New_York` (or your zone's name).
- One install per Mac user account.
- Jobs run while your Mac is on and you're logged in.
- Publishing to Google Docs and Drive and sending email need a separate [Composio](https://composio.dev) account. Everything else works without it.

---

## Updates and security fixes

### How you hear about one

Daisy Handoff doesn't check for updates by itself. To hear about new releases, including security fixes:

1. On this repo's GitHub page, click **Watch**, then **Custom**.
2. Tick **Releases**, then **Apply**.

GitHub then tells you about each new release ([GitHub's notification settings](https://docs.github.com/en/account-and-profile/managing-subscriptions-and-notifications-on-github/setting-up-notifications/configuring-notifications)). When a release fixes a security problem, its release notes and [CHANGELOG.md](CHANGELOG.md) say so at the top, and the fix is described in a security advisory under this repo's **Security** tab. [SECURITY.md](SECURITY.md) lists which versions get security fixes.

To see which version you have, look at `installer` in `install-receipt.json` in your install folder, or the first line the installer printed.

### How to update

1. Download the new **daisy-handoff.zip** and unzip it.
2. In Terminal, in the new folder: `node install.mjs --uninstall`
3. Then: `node install.mjs --force`, and give the same answers as last time (same assistant name, so it reuses your connector and database). If you used `--no-power-lanes`, `--time-zone` or `--lead-agent` before, add them again.
4. The update makes a new connector URL. In Claude, remove the old connector under **Customize > Connectors** and add the new URL, which the installer copied for you.

Your job history stays in your Cloudflare database. Your old install folder is kept next to the new one as `~/Projects/daisy-handoff.bak-DATE`, with its job folders and logs. Delete it once you're happy.

---

## Uninstall

This removes everything: the background worker, its startup entries, your connector and database on Cloudflare, and the files on your Mac.

1. In Terminal, in the unzipped release folder: `node install.mjs --uninstall`. This stops the worker and moves its startup entries to `~/.handoff-uninstalled`.
2. Delete the connector and its database from Cloudflare:
   ```bash
   cd ~/Projects/daisy-handoff
   npx -y wrangler@4.151.3 delete --force
   npx -y wrangler@4.151.3 d1 delete daisy-handoff-jobs -y
   ```
3. Delete the local files: `rm -rf ~/Projects/daisy-handoff ~/Projects/daisy-handoff.bak-* ~/.daisy ~/.handoff-uninstalled`
4. In Claude, remove the connector under **Customize > Connectors**.

Use your own names if your assistant isn't called Daisy (for Max: `max-handoff`, `max-handoff-jobs` and `~/.max`). Claude Code, Node and your Cloudflare account stay; remove those separately if you want. Claude Code also keeps a note that it trusted the bell's folder, in `~/.claude.json`. It's harmless once the folder is gone.

---

## If your URL leaks: change the key

In Terminal:

```bash
cd ~/Projects/daisy-handoff
openssl rand -hex 32 | tr -d '\n' > .connector-key
npx -y wrangler@4.151.3 secret put CONNECTOR_KEY < .connector-key
printf '%s/%s/mcp' "$(node -p "require('./worker/config.json').base")" "$(cat .connector-key)" > .connector-url
pbcopy < .connector-url
```

The old URL stops working within a few seconds. In Claude, remove the old connector under **Customize > Connectors** and add it again with the new URL (it's on your clipboard). Your jobs, history and worker carry on as before.

---

## Isn't this already built into Claude?

Partly, and that's good.

**Claude Code Remote Control** puts a Claude Code session from your computer on your phone. Use it. Daisy Handoff uses it too, for the session that sends your phone notifications.

**Daisy Handoff** is for when you're talking, not typing: one voice conversation that can start new jobs, check on all of them, approve the ones waiting on you, and put work on a schedule.

When Anthropic ships all of this natively, use theirs.

---

## Why this exists

Claude's voice mode is the best place I've found to think out loud. But it couldn't reach my computer.

So every time a thought turned into a task, I had to stop talking, open the laptop, find the right session, type it all out, and come back later. The typing wasn't the problem. Losing the thread was.

Daisy Handoff removes that switch. The idea stays in the conversation and the work goes to the computer.

---

## Get help

First run `node doctor.mjs` and look at [TROUBLESHOOTING.md](TROUBLESHOOTING.md). Most install problems are there.

Open an issue at [github.com/prophet316/daisy-handoff-release/issues](https://github.com/prophet316/daisy-handoff-release/issues) and pick **Install problem**, **Something broke** or **Idea**. For a security problem, use **Security > Report a vulnerability** instead, so it stays private.

A good bug report has:

- What you said or ran, word for word, and what happened instead.
- The doctor's report. `node doctor.mjs` saves it and prints where. Keys, your connector URL, emails and your user name are already removed; read it before you paste it.
- Or, by hand: the installer version (the first line it prints), your macOS version, `node -v`, `claude --version`, and `install-receipt.json` from your install folder (it holds no keys).
- The last 30 lines of `logs/worker.log` in your install folder, if a job misbehaved. Read them first and cut anything private.

Never paste your connector URL, `.connector-url`, `.connector-key`, `.worker-key` or `.bell-key`. If one slips out, change the key (above).

---

## Credit

Built by Jonathan Gibson, on top of Claude, Claude Code and Remote Control from Anthropic, and Cloudflare Workers.

Other people have built voice tools for Claude Code too, and they are worth a look: [VoiceMode](https://github.com/mbailey/voicemode) and [claude-code-voice-skill](https://github.com/abracadabra50/claude-code-voice-skill). Desktop control uses [CuaDriver](https://github.com/trycua/cua) from trycua.

Daisy Handoff is an independent project. It is not affiliated with, made by or endorsed by Anthropic. Claude and Claude Code are trademarks of Anthropic.

## License

[FSL-1.1-MIT](LICENSE). Free to use, change and share for anything except selling it as a competing product. Each version becomes plain MIT two years after its release.
