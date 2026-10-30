# Nuff Said

[![Latest release](https://img.shields.io/github/v/release/prophet316/daisy-handoff-release)](https://github.com/prophet316/daisy-handoff-release/releases/latest)
[![Installer CI](https://github.com/prophet316/daisy-handoff-release/actions/workflows/installer.yml/badge.svg)](https://github.com/prophet316/daisy-handoff-release/actions/workflows/installer.yml)
[![License: FSL-1.1-MIT](https://img.shields.io/badge/license-FSL--1.1--MIT-blue)](LICENSE)

**Talk to Claude. Your computer does the work.**

Nuff Said is made for Claude.
It's an independent project, not made by, affiliated with or endorsed by Anthropic.

Nuff Said works inside the Claude app you already use. It's one custom connector you add in Claude. After that, a conversation with Claude, including a live voice conversation on your phone, can hand real work to Claude Code on your own computer: start jobs, check on them, approve, schedule, and stop everything. Claude's voice, your chats and your other connectors stay exactly as they are. Daisy is the default name for your assistant, the worker on your computer that picks up each job; you can pick another name at install.

Setup takes a Terminal installer and a free Cloudflare account. After that, day to day, you stay in Claude. Mac today; Windows is in testing and isn't in this release.

> [!WARNING]
> **Read this first.** Nuff Said ships with the command line and desktop control turned on, the way the author uses it. That means a job can do anything you can do at your keyboard: run commands, change or delete files, open apps, and click and type on your desktop, using your logins. A leaked connector URL or a prompt injection in a web page or email could cause real damage: anyone with the URL can use it through Claude or the Claude API, and with the command line on that includes running commands on your computer and reading the result. Sends, posts, spending, deletes and access changes stop for your yes unless you asked for them. The built-in desktop, email and publishing tools are held in code, but a job with a command line can still reach those apps another way. For everything else a job does, the stop is an instruction to Claude. That lowers the risk but doesn't remove it. To turn it off, answer no to the installer's question or run it with `--no-power-lanes`. Turning it off is not a sandbox: normal Claude Code jobs still run. Install it only on a computer you trust it with. Desktop control is Mac only for now.

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

From one conversation: jobs, threads, routines, schedules, approvals, a daily digest, a health check and an emergency stop, plus the command line and desktop control if you turn them on.

<!-- TODO(SCREENSHOTS_PLAN S6): readme/06-whats-running.png, the "What's running" answer in the Claude app. -->

---

## What you need

Everything here is listed before you start, with what it costs.

| What | Cost | Notes |
| ---- | ---- | ----- |
| A Mac on macOS 13 (Ventura) or newer | | |
| A paid Claude plan: Pro or Max (see the note on Team and Enterprise in [Install](#install-mac)) | Pro is $20 a month ($17 a month billed yearly); Max starts at $100 a month ([Claude pricing](https://claude.com/pricing)) |
| Claude Code, installed and signed in on the Mac | Included with the plan. Jobs use your plan's normal Claude Code usage limits. Up to 3 jobs run at once and schedules add more, so on Pro, start fewer at once. | Install it with the command on [Anthropic's setup page](https://code.claude.com/docs/en/setup) (`curl -fsSL https://claude.ai/install.sh \| bash`), open a new Terminal window, run `claude`, and type `/login`. Sign in with your Claude plan, not an API key. If `claude` says command not found, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md#claude-command-not-found). |
| The Claude app on your phone | Free |
| Node 22.13 or newer | Free |
| Apple's Command Line Tools | Free |
| Your Mac's administrator password | |
| A Cloudflare account | Free plan is enough |
| CuaDriver (optional) | Free | For desktop control only. Needs macOS 14 (Sonoma) or newer. |
| A [Composio](https://composio.dev) account (optional) | See Composio |

---

## Features

Everything here runs on the Mac. A Windows worker is in testing and isn't in this release.

### Hand off work while you talk

| Feature | What it does for you |
|---|---|
| Hand off a job | Say what you want done and it goes to Claude Code on your computer. The idea turns into work without stopping the conversation. |
| Ongoing threads | Start a named project and keep giving it the next task. It picks up where it left off. |
| Several jobs at once | Up to 3 jobs run side by side out of the box. |
| Change a job while it runs | "Add a summary at the end" reaches a running job. Steer it without starting over. |
| Try again | "Retry it, but skip the old files." |
| Find a job by describing it | "What did the finances job find?" works without job numbers. |

### Stay in the loop

| Feature | What it does for you |
|---|---|
| What's new | Ask "what's new?" and Claude tells you what finished or needs you since you last heard. It's set up to check at the start of a chat, but Claude decides when to call it. |
| What's running | Ask from any Claude chat and hear every job and its status. |
| Read what a job made | Claude reads the files a job made, or a live view of one still running. |
| Phone notification when a job is done | If you turn it on, your phone gets a Claude app notification with the result. Claude Code can skip a push when it sees you're already active. See [Phone notifications and Remote Control](#phone-notifications-and-remote-control). |
| Daily digest | One short summary of the day, at a time you pick. |
| Health check | One question tells you whether the worker, phone bell, sign-ins and disk space are fine. |

### You stay in charge

| Feature | What it does for you |
|---|---|
| Asks before it acts | Sending, posting, spending, deleting and access changes stop and wait for your yes, unless your request asked for them. The built-in desktop control, email and publishing tools are held in code; a job's command line is held only by an instruction to Claude. It lowers the risk; it doesn't remove it. |
| Agents can't approve for you | Your own Claude chat is recognized as you, by the Anthropic address it calls from. Agents and scripts that call the URL directly are labeled as agents: they can't approve, ask for a publish or share, or use the run-command and desktop tools. If one retries or replies to a job of yours that publishes, the work runs but the publish waits for you. They can still start ordinary jobs, which run Claude Code with its command line; those jobs are marked as theirs and told it isn't your approval. It's a check on where the call comes from, not a login; see [SECURITY.md](SECURITY.md). |
| Stop everything | Two words halt every running job and pause the queue and schedules. |
| Force-stop and restart | Stops a stuck job and everything it started, or restarts the worker, even if the worker is frozen. |
| Off switch for the powerful parts | Answer no at install, or use `--no-power-lanes`, and the command line and desktop control are gone. Not a sandbox: normal Claude Code jobs still run. |

<!-- TODO(SCREENSHOTS_PLAN S3): readme/03-approval-phone.png, Claude on the phone asking before it sends. Caption must keep: "Asking first lowers the risk. It does not remove it." -->

### Schedules and routines

| Feature | What it does for you |
|---|---|
| Schedules | "Every weekday at 7, send me a news brief." Once, daily, weekdays or weekly, in your own time zone. |
| Routines | Save a few steps as a routine ("my morning routine") and run it by name or on a schedule. |

### Hands on your computer (on by default, see the warning above)

| Feature | What it does for you |
|---|---|
| Run a command | Quick commands from the conversation, like what's running or git status. A short blocklist turns down commands that ask for root (sudo), disk erases, reading saved passwords or changing macOS security settings. It catches mistakes; it isn't a security boundary. |
| Look at the screen | Claude takes a screenshot and answers a question like "is the export finished?" |
| Use the computer | Claude opens apps and pages, clicks and types, and reports back. It waits while you're using the mouse or keyboard, stays out of Terminal, System Settings, Keychain Access, password managers and the Claude app unless you name them, and is built to stop at the step that charges money, so you approve it once. It spots that step from the button and the wording, so it can miss one: watch any job that shops. |
| Watch it work | A soft blue glow at the screen edges and the assistant's own cursor show where Claude is working. It's built not to move your pointer. |

<!-- TODO(SCREENSHOTS_PLAN S5): readme/05-glow.png, blue glow and Daisy cursor mid-run. Caption: "Mac only." -->

### Where your data lives

| Feature | What it does for you |
|---|---|
| Your own connector | The installer puts your connector and its database on your own free Cloudflare account. No shared server: your jobs are stored on your own Cloudflare account, not on a server the author runs, so the author can't see them. Your Claude chats and the bell's Remote Control session are stored by Anthropic like any other Claude conversation. |
| No open ports | Your computer reaches out; nothing reaches in. That isn't the same as safe: your connector URL is the way in, so treat it like a password. |
| Keys made on your computer | Three random keys (four with a lead agent), readable only by you, never printed or logged. |
| Change a leaked key | If your connector URL or a key leaks, `node install.mjs --rotate-keys` changes the keys and lists every schedule, routine, running job and job waiting to run, so you can clear anything you didn't set up. |

### Setup and upkeep

| Feature | What it does for you |
|---|---|
| One installer | `node install.mjs`, five questions, a Cloudflare sign-in, then paste a link into Claude. |
| Preview first | `--dry-run` shows everything it would do and deploys nothing. |
| Doctor | `node doctor.mjs` finds common problems, says what to do, and saves a report with your keys removed. |
| Starts by itself | The worker starts at login and comes back after a crash. |
| Update in place | `node install.mjs --update` keeps your keys, connector URL, database and job folders, so there's nothing to redo in Claude. |
| Uninstall | A short set of steps removes everything, on your computer and on Cloudflare. |
| Works with your other connectors | Calendar, mail and every other connector you use still work in the same chat. |
| Publish to Google Docs or Drive, send email | A finished job can publish or share its result, or send an email you approved. Needs a Composio account. |

### Mac only, for now

The whole worker is Mac only in this release. The blue glow and Daisy cursor stay Mac only when the Windows worker ships.

---

## Your connector follows your Claude account

Your connector lives in your Claude account, not on one device. Anthropic's help page says a custom connector you set up works "across every Claude client, including claude.ai, Claude Desktop, Cowork, and the mobile apps" ([Get started with custom connectors using remote MCP](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)). So the jobs you start by voice on your phone should be the same jobs you see from the Claude app on your computer or from claude.ai in a browser. The author uses it from the Claude phone app and has also checked it in Claude Duet chats (Duet is an invite-only research preview from Anthropic, and its help page doesn't cover custom connectors).

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

Your computer never opens a port. The worker reaches out to your connector; nothing reaches in. Every install has its own connector, its own database and its own keys, so the author can't see your jobs.

Jobs run while your Mac is on and you're logged in. One install per Mac user account.

### Phone notifications and Remote Control

**Remote Control** is a Claude Code feature from Anthropic. It links a Claude Code session running on your computer to the Claude app on your phone, so that session can talk to you there. Anthropic explains it on the [Remote Control page](https://code.claude.com/docs/en/remote-control).

Nuff Said uses it for one thing: notifications, and only if you turn them on. Then the installer starts one Claude Code session on your Mac with Remote Control on, and keeps it running. You may see it in the Claude app as "Daisy bell" (or your assistant's name). Leave it running. When a job finishes, the worker tells that session, and the session sends your phone a notification through the Claude app. Claude Code decides when to push, and it can skip one while you're active in Claude: Anthropic says "the server can still suppress the mobile push when it detects that you are active" ([Environment variables](https://code.claude.com/docs/en/env-vars)).

The bell also uses Claude Code channels, a research preview from Anthropic ([Channels](https://code.claude.com/docs/en/channels)), so the worker can hand the session each finished job. The bell's channel isn't on Anthropic's approved list, so the bell starts Claude Code with its developer flag for channels, `--dangerously-load-development-channels server:daisy-bell`. That flag shows a warning that Anthropic meant for people testing their own channels, and its answer is "I am using this for local development." That warning comes back every time the bell starts, and nobody is at that terminal to answer it, so **if you turn on phone notifications, the bell picks that answer for you each time it starts**. It also says yes to Claude Code's question about the bell's own MCP server. The installer says this in the question itself, and the bell stays off unless you say yes: pressing Enter, `--yes`, and an update from a version before the question all leave it off. The session loads only Daisy's channel, none of your other connectors.

If you'd rather not, press Enter at the installer's phone notification question (the answer is no unless you type yes), or turn the bell off later: run `node install.mjs --update --no-bell` from the release folder. That stops the bell and moves its startup entry aside, and later updates keep it off. Jobs work the same; you just don't get phone notifications. `--update --bell` turns it on. `--no-bell` or `--bell` on a first install answers the question for you.

Anthropic says channels may change, so a Claude Code update could stop notifications until Nuff Said is updated. Jobs keep running either way.

<!-- TODO(SCREENSHOTS_PLAN S4): readme/04-done-push.png, a Claude app notification on the lock screen with the job's real result. -->

For that to work:

- The Claude app on your phone is signed in to the same account as Claude Code on your Mac.
- Notifications are allowed for the Claude app on your phone.
- Claude Code is signed in with your Claude plan, not an API key. Remote Control doesn't work with API keys.
- Push is on in Claude Code: run `claude`, type `/config`, turn on **Push when Claude decides**, then `/exit`.

Notifications are the only part that needs Remote Control. Starting and checking jobs works without it.

---

## Before you install: what you're giving it

- **Treat the connector URL and its key like a password.** Anyone who has the URL can use your connector through their own Claude or the Claude API, and those calls come from Anthropic's servers just like yours, so they count as you. With the command line on (the default), that means running any command on your computer and reading the result, right away, with no approval step. The key is the long part near the end of the URL. It's saved in `.connector-url` and `.connector-key` in your install folder, readable only by you. Keep both out of screenshots, screen recordings, chats, issues and bug reports.
- **Jobs run as you.** A job runs Claude Code with your files and your sign-ins, so it can also read your connector URL and keys in the install folder. A job tricked by a web page or email could use them. Install it on a computer you're comfortable trusting it with.
- **The command line and desktop control are on by default.** Claude can run shell commands on your computer from the conversation, take screenshots of your screen, and click and type on your desktop. To turn them off, answer no to the installer's question or run it with `--no-power-lanes`. Off, those tools are hidden from Claude and your computer refuses them too. Turning them off is not a sandbox: code and design jobs still run Claude Code with its normal tools, including its own command line, inside the folders you send them to. If you already installed, run `node install.mjs --update --no-power-lanes` from the release folder (or `--update --power-lanes` to turn them back on). Your connector URL stays the same.
- **Send, post, spend and delete need your yes.** Jobs stop and ask before any of those unless your request asked for it. For desktop control, email and publishing, the built-in tools stop for your yes in code. A code or design job still has its own command line, though, so a job tricked by a web page or email could reach your desktop, Composio or other apps another way. For everything else a job does, the stop is an instruction to Claude, and a well-made trick can get past an instruction.
- **Agents can't give that yes.** Every job, thread, schedule, routine, message, reply, approval, cancel and stop records who sent it. Your own Claude chat reaches the connector from Anthropic's servers, so it's recognized as you. A script or agent that calls the URL directly, like a job on your computer, is labeled as an agent. The connector refuses its approvals and its answers to a job waiting for your yes, and it can't publish, share, use the run-command tool, look at or use your desktop, or undo stop everything. What it starts is marked as an agent's, and the job is told that isn't your approval. Agents can still start work, including ordinary jobs that run Claude Code with its command line, message each other and keep working. This is a check on where the call comes from, not a login: anything else that reaches your connector through Anthropic, like someone else's Claude or the Claude API with any key, comes from the same addresses and counts as you. So could a job on your computer that starts its own Claude session using the connectors in your Claude account: jobs are started with those connectors switched off, but a job can switch them back on. That's why the URL is a password.
- **Letting a lead agent approve for you is off.** `--lead-agent NAME` turns it on for one named agent. It can approve and answer jobs waiting for your yes, and nothing more: it still can't publish, share, or use the run-command and desktop tools. Its approvals are logged as that agent, never as you, and a run it approved doesn't publish until you say so. The catch: it proves itself with a key file, `.lead-agent-key`, and any job on your computer can read that file, so a job that was tricked by a web page or email could approve for you too. Leave it off unless you need it. To turn it off: `node install.mjs --update --no-lead-agent`. Your connector URL stays the same.

Read [SECURITY.md](SECURITY.md) for the details.

---

## Install (Mac)

1. Download **[nuff-said.zip](https://github.com/prophet316/daisy-handoff-release/releases/latest/download/nuff-said.zip)** and unzip it.
2. Open Terminal (Applications > Utilities > Terminal), go to the folder, and run the installer:
   ```bash
   cd ~/Downloads/nuff-said
   node install.mjs
   ```
   It checks Node and Claude Code first and tells you exactly what's missing.
3. Answer five questions (your name, what you call your assistant, what you call this computer, whether jobs may use the command line and control your desktop, and whether to turn on phone notifications; the command line question is yes unless you type no, and phone notifications stay off unless you type yes). Before the last question it says what the phone bell answers for you; see [Phone notifications and Remote Control](#phone-notifications-and-remote-control).
4. Sign in to Cloudflare when your browser opens.
5. In Claude, go to **Customize > Connectors**, click **+ Add**, choose **Add custom connector**, name it **Nuff Said**, paste the URL the installer copied for you, and click **Continue**. Claude then shows the authentication settings it detected: under **Authentication**, choose **No sign in**, leave **Request headers** empty, and click **Add**. Your key is already in the URL. (Anthropic's steps: [Get started with custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).) Then copy something else, so the URL isn't left on your clipboard or in a clipboard history.
6. Open the Claude app, start voice, and say: **"Check updates with Daisy."** (or whatever you named your assistant). You're still talking to Claude; the name tells Claude to use your connector.
7. If you turned on phone notifications: allow notifications for the Claude app on your phone, then on the Mac run `claude`, type `/config`, turn on **Push when Claude decides**, and type `/exit`.

**Pro and Max only for now.** On Team and Enterprise, an admin (an Owner, or on Enterprise someone whose role can manage connectors) adds a custom connector for the organization, and people across it can then connect to it. Your connector URL can run commands on your Mac, so don't add it to a shared organization.

<!-- TODO(SCREENSHOTS_PLAN S1): readme/01-installer.png, the installer after the five questions and the "copied" line. No URL visible. -->
<!-- TODO(SCREENSHOTS_PLAN S2): readme/02-connector.png, the Add custom connector dialog with a dummy URL. -->

Something not working? Run `node doctor.mjs` in the same folder. It finds the common problems and says what to do; [TROUBLESHOOTING.md](TROUBLESHOOTING.md) explains each one. If the installer keeps failing, [MANUAL-INSTALL.md](MANUAL-INSTALL.md) does the same steps one at a time.

To see everything it would do first, run `node install.mjs --dry-run`. It builds the install in a throwaway folder and deploys nothing.

Your install lives in `~/Projects/daisy-handoff` (the name follows what you call your assistant, so an assistant called Max lives in `~/Projects/max-handoff`). Your connector on Cloudflare has the same name, and its database adds `-jobs` to it. These names still end in `-handoff`, from before the project was called Nuff Said, so updates keep finding your install.

**Good to know:**
- Schedules and times use your Mac's time zone, which the installer shows. To use another one, add `--time-zone America/New_York` (or your zone's name).
- One install per Mac user account.
- Jobs run while your Mac is on and you're logged in.
- Jobs use your Claude plan's normal Claude Code usage limits. A job has no time limit (a runaway guard stops it after 24 hours), so check on long ones.
- Publishing to Google Docs and Drive and sending email need a separate [Composio](https://composio.dev) account. Everything else works without it.

---

## Updates and security fixes

### How you hear about one

Nuff Said doesn't check for updates by itself. To hear about new releases, including security fixes:

1. On this repo's GitHub page, click **Watch**, then **Custom**.
2. Tick **Releases**, then **Apply**.

GitHub then tells you about each new release ([GitHub's notification settings](https://docs.github.com/en/account-and-profile/managing-subscriptions-and-notifications-on-github/setting-up-notifications/configuring-notifications)). When a release fixes a security problem, its release notes and [CHANGELOG.md](CHANGELOG.md) say so at the top, and the fix is described in a security advisory under this repo's **Security** tab. [SECURITY.md](SECURITY.md) lists which versions get security fixes.

To see which version you have, look at `installer` in `install-receipt.json` in your install folder, or the first line the installer printed.

### How to update

1. Download the new **nuff-said.zip** and unzip it.
2. In Terminal, in the new folder: `node install.mjs --update`

That's it. The update keeps your keys, so your connector URL stays the same and there's nothing to redo in Claude. It also keeps your connector and database on Cloudflare, your answers from last time (name, time zone, the command line switch, the lead agent), your job and thread folders, your logs and your worker settings. It keeps the phone bell on or off as you left it. An install from before 0.9.1 has no answer on record, so the update asks; pressing Enter or `--yes` turns the bell off. To change one answer while you update, add its flag, for example `--no-power-lanes`, `--no-lead-agent`, `--no-bell` or `--time-zone Europe/London`. Jobs that are running when the worker restarts start again.

Your job history stays in your Cloudflare database. The old install folder is kept next to the new one as `~/Projects/daisy-handoff.bak-DATE`. Delete it once you're happy.

`node install.mjs --force` still starts over with new keys and a new connector URL, if you ever want that.

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

Use your own names if your assistant isn't called Daisy (for Max: `max-handoff`, `max-handoff-jobs` and `~/.max`). Claude Code, Node and your Cloudflare account stay; remove those separately if you want. The installer also marked the bell's folder as trusted in Claude Code's `~/.claude.json`, so Claude Code doesn't stop to ask. It's harmless once the folder is gone.

---

## If your URL leaks: change the keys

In Terminal, in an unzipped release folder (the newest you have; it finds your install in `~/Projects`):

```bash
node install.mjs --rotate-keys
```

It changes the connector key first, on Cloudflare and on your Mac, so the old URL stops working right away. Then it lists every schedule, routine, running job and job waiting to run, with who set each one up, and asks whether to turn them all off and stop the jobs. Anyone who had your URL could have saved some through Claude, and then they show as yours, so check every one. The worker keeps running while you read the list. After that it changes the worker key and the lead agent key if you have one, and right away restarts the worker and supervisor on the new keys: jobs you chose to stop stay stopped, and other running jobs start again from the beginning. It checks that the new URL works and the old one is turned away, which takes a few seconds. `node install.mjs --clear-schedules` turns them all off later.

Then in Claude, remove the old connector under **Customize > Connectors** and add it again with the new URL (it's on your clipboard; copy something else afterwards). Your job history stays.

If the URL was out while the command line was on, assume someone could have run commands as you. Read `logs/shell.log` in your install folder for commands you didn't run, and check `crontab -l` and `~/Library/LaunchAgents` for anything you don't recognize. If you find any, treat the Mac as compromised. [SECURITY.md](SECURITY.md) has the same steps by hand.

---

## Isn't this already built into Claude?

Partly, and that's good. Anthropic keeps adding to this, so check their pages for what's current.

**The new Claude experience** (chat and Cowork in one) lets voice mode keep going "in any conversation, including ones where Claude is working on a task", and voice mode can use the tools you've connected ([Use voice mode](https://support.claude.com/en/articles/11101966-use-voice-mode)). If that covers what you need, use it.

**Dispatch** in Claude Cowork lets you "message Claude from your phone and have it work on your desktop computer", with a push when a task is done or needs your go-ahead. It's Anthropic's own and needs nothing beyond the Claude apps. Today it's "in limited beta on some Pro and Max plans" and "isn't available to new users" ([Assign tasks from anywhere in Claude Cowork](https://support.claude.com/en/articles/13947068-assign-tasks-from-anywhere-in-claude-cowork)). If you have it, try it.

**Claude Code Remote Control** lets you use and start Claude Code sessions on your computer from your phone ([Remote Control](https://code.claude.com/docs/en/remote-control)). Use it. Nuff Said uses it too, for the session that sends your phone notifications.

**Nuff Said** is for handing work to Claude Code on your own computer while you talk: one voice conversation in the Claude app that starts new jobs, checks on all of them, approves the ones waiting on you, and puts work on a schedule, through a connector and database on your own Cloudflare account. The worker is its own background service on your Mac, separate from the Claude desktop app. It lets you talk to Claude in the phone app's live voice mode while Claude Code on your own Mac runs the jobs, with a queue, named threads, schedules, approvals and a stop switch around them.

When Anthropic ships all of this natively, use theirs.

---

## Why this exists

Claude's voice mode is the best place I've found to think out loud. But back then it couldn't hand work to Claude Code on my computer.

So every time a thought turned into a task, I had to stop talking, open the laptop, find the right session, type it all out, and come back later. The typing wasn't the problem. Losing the thread was.

Nuff Said removes that switch. The idea stays in the conversation and the work goes to the computer.

---

## Run the tests

Everything here runs offline and deploys nothing. The tests need Node 22.13 or newer.

```bash
# in the release folder (the zip has the test folder too): a throwaway install, then its checks
node install.mjs --dry-run --yes --home /tmp/nuff-test
node test/verify-dry-run.mjs /tmp/nuff-test daisy-handoff darwin
node test/doctor-no-leak.mjs
node test/update-resume.mjs
# in that install (or yours): the desktop gate, the host lane, the command line switch, who-sent-it,
# the schedule math in several time zones, redaction, the bell and its startup prompts
cd /tmp/nuff-test/Projects/daisy-handoff && ./test.sh gate
# or one at a time
node test/time-unit.mjs
node worker/shell-lane.mjs --shell-selftest
```

GitHub runs the installer dry run, update and key change, the time zone, redaction and bell prompt tests on macOS and Windows for every change, and `./test.sh gate` on macOS ([installer.yml](.github/workflows/installer.yml)).

---

## Get help

First run `node doctor.mjs` and look at [TROUBLESHOOTING.md](TROUBLESHOOTING.md). Most install problems are there.

Open an issue at [github.com/prophet316/daisy-handoff-release/issues](https://github.com/prophet316/daisy-handoff-release/issues) and pick **Install problem**, **Something broke** or **Idea**. For a security problem, use **Security > Report a vulnerability** instead, so it stays private.

A good bug report has:

- What you said or ran, word for word, and what happened instead.
- The doctor's report. `node doctor.mjs` saves it and prints where. Keys, your connector URL, emails and your user name are already removed; read it before you paste it.
- Or, by hand: the installer version (the first line it prints), your macOS version, `node -v`, `claude --version`, and `install-receipt.json` from your install folder (it holds no keys).
- The last 30 lines of `logs/worker.log` in your install folder, if a job misbehaved. Read them first and cut anything private.

Never paste your connector URL, `.connector-url`, `.connector-key`, `.worker-key`, `.bell-key` or `.lead-agent-key`. If one slips out, change the keys (above).

---

## Credit

Built by Jonathan Gibson, on top of Claude, Claude Code and Remote Control from Anthropic, and Cloudflare Workers.

Other people have built ways to reach Claude Code by voice too, and they are worth a look: [claude-voice](https://github.com/roykollensvendsen/claude-voice) and [claude-voice-mcp](https://github.com/guillaume-gonano/claude-voice-mcp) work from the Claude phone app's voice mode, [Desktop Commander](https://desktopcommander.app/mcp/) connects Claude to your computer, and [VoiceMode](https://github.com/mbailey/voicemode) and [claude-code-voice-skill](https://github.com/abracadabra50/claude-code-voice-skill) add voice on the computer itself. Desktop control uses [CuaDriver](https://github.com/trycua/cua) from trycua.

Nuff Said is an independent project. It is not affiliated with, made by or endorsed by Anthropic. Claude and Claude Code are trademarks of Anthropic.

## License

[FSL-1.1-MIT](LICENSE). Free to use, change and share for anything except selling it as a competing product. Each version becomes plain MIT two years after its release.
