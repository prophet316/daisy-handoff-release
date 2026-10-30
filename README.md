# Nuff Said

[![License: FSL-1.1-MIT](https://img.shields.io/badge/license-FSL--1.1--MIT-blue)](LICENSE)

**Talk to Claude. Your computer does the work.**

Nuff Said is made for Claude.
It's an independent project, not made by, affiliated with or endorsed by Anthropic.

Nuff Said works inside the Claude app you already use. It's one custom connector you add in Claude. After that, a conversation with Claude, including a live voice conversation on your phone, can hand real work to Claude Code on your own computer: start jobs, check on them, approve, schedule, and stop everything. Claude's voice, your chats and your other connectors stay exactly as they are. Daisy is the default name for your assistant, the worker on your computer that picks up each job; you can pick another name at install.

Setup takes a Terminal installer and a free Cloudflare account. After that, day to day, you stay in Claude. Mac today; Windows is in testing and isn't in this release.

> [!WARNING]
> **Read this first.** Nuff Said ships with the command line and desktop control **on**, the way I use it.
> - **What a job can do:** anything you can do at your keyboard, like running commands, changing or deleting files, opening apps, and clicking and typing on your desktop, with your logins.
> - **Who can start one:** anyone with your connector URL, through their own Claude or the Claude API, and anyone who can change your connector on your Cloudflare account. A prompt injection in a web page or email can steer a job too.
> - **What waits for your yes:** sends, posts, spending, deletes and access changes, unless you asked for them. The built-in desktop, email and publishing tools hold them in code, but a job with a command line can reach those apps another way. Everything else is an instruction to Claude, and so is the "untrusted" label on job output read back into your chat. That lowers the risk but doesn't remove it.
> - **The off switch:** answer no to the installer's question, or use `--no-power-lanes`. It's not a sandbox: code jobs still run Claude Code with its own command line.
>
> Install it only on a computer you trust it with. Desktop control is Mac only for now. Details: [SECURITY.md](SECURITY.md).

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
- "Start things again." (after a stop, so queued jobs and schedules run again)

From one conversation: jobs, threads, routines, schedules, approvals, a daily digest, a health check and an emergency stop, plus the command line and desktop control, which are on unless you turn them off.

<!-- TODO(SCREENSHOTS_PLAN S6): readme/06-whats-running.png, the "What's running" answer in the Claude app. -->

---

## What you need

Everything here is listed before you start, with what it costs.

| What | Cost | Notes |
| ---- | ---- | ----- |
| A Mac on macOS 13 (Ventura) or newer | | |
| A paid Claude plan: Pro or Max (see the note on Team and Enterprise in [Install](#install-mac)) | Pro is $20 a month ($17 a month billed yearly); Max starts at $100 a month ([Claude pricing](https://claude.com/pricing)) |
| Claude Code, installed and signed in on the Mac | Included with the plan. Jobs use your plan's normal Claude Code usage limits. Up to 3 jobs run at once, and scheduled jobs count against the same plan limits, so on Pro, start fewer at once. | Install it with the command on [Anthropic's setup page](https://code.claude.com/docs/en/setup) (`curl -fsSL https://claude.ai/install.sh \| bash`), open a new Terminal window, run `claude`, and type `/login`. Sign in with your Claude plan, not an API key. If `claude` says command not found, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md#claude-command-not-found). |
| The Claude app on your phone | Free |
| Node 22.13 or newer | Free |
| Apple's Command Line Tools | Free | For phone notifications (they run with `/usr/bin/python3`) and the blue glow (built with Swift). Jobs, stop everything and force kill work without them. Install with `xcode-select --install`. |
| Your Mac's administrator password | | Only if you still need to install Node or the Command Line Tools; their installers ask for it. Nuff Said's installer never asks for it. |
| A Cloudflare account | Free plan is enough for one install. An idle install makes about 14,400 of the free plan's 100,000 Worker requests a day, which are shared across your Cloudflare account, and running jobs add more ([Cloudflare requests](#cloudflare-requests)). It uses 1 of the 5 cron triggers a free account allows. |
| Workers AI on the same Cloudflare account | Free allowance is plenty | Finds a job by description: each job's title, details and result go to a Cloudflare text-embedding model on your account. If the free allowance runs out, finding a job falls back to keywords. |
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
| Stop everything | Two words halt every running job and pause the queue and schedules. They stay paused until you say "start things again" in your own Claude chat; jobs it stopped stay stopped until you retry them. An agent can stop everything but can't start it again. |
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
| Watch it work | A soft blue glow at the screen edges and the assistant's own cursor show where Claude is working. It's built not to move your pointer. The installer builds the glow with Apple's Command Line Tools; if that build fails, desktop control still works with CuaDriver's own cursor and no glow, and the doctor says so. |

<!-- TODO(SCREENSHOTS_PLAN S5): readme/05-glow.png, blue glow and Daisy cursor mid-run. Caption: "Mac only." -->

### Where your data lives

| Feature | What it does for you |
|---|---|
| Your own connector | The installer puts your connector and its database on your own free Cloudflare account. No shared server: your jobs are stored on your own Cloudflare account, not on a server I run, so I can't see them. To make finding a job by description work, job text also goes through Workers AI on your Cloudflare account. Your Claude chats and the bell's Remote Control session are stored by Anthropic like any other Claude conversation. |
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

Your connector lives in your Claude account, not on one device. Anthropic's help pages say Claude reaches a custom connector "from Anthropic's cloud infrastructure," on every Claude client including the mobile apps ([Get started with custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)), and that a connector you set up on the web or desktop "will be available to use the next time you log in to your account on Claude for iOS or Android" ([Use connectors to extend Claude's capabilities](https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities)). So the jobs you start by voice on your phone should be the same jobs you see from the Claude app on your computer or from claude.ai in a browser. I use it from the Claude phone app and have also checked it in Claude Duet chats (Duet is an invite-only research preview from Anthropic, and its help page doesn't cover custom connectors).

---

## How it works

```
You (voice or chat, Claude app)
   -> Claude
   -> your connector (a Cloudflare Worker on YOUR free Cloudflare account)
   -> job queue
   <- worker on your computer checks for new jobs every 20 seconds
      (a small supervisor checks for stop commands: every 15 seconds idle, every 2 while a job runs or for 10 minutes after a stop)
   -> Claude Code does the work, then you get a notification
```

Nothing on your computer listens to the internet. The worker reaches out to your connector; nothing reaches in. (With phone notifications on, the bell listens on 127.0.0.1, this computer only, and needs its own key.) Every install has its own connector, its own database and its own keys, so I can't see your jobs.

### Cloudflare requests

Cloudflare's free plan allows 100,000 Worker requests a day, shared by every Worker on the account; past that, Cloudflare answers with Error 1027 until midnight UTC ([Workers limits](https://developers.cloudflare.com/workers/platform/limits/)). That would include stop everything, which also goes through your connector. What one install uses:

- Idle: about 14,400 a day. The worker asks for new jobs and due schedules every 20 seconds (8,640), and the supervisor checks for stop commands every 15 seconds (5,760).
- While a job is queued or running, for a minute after a command, and for 10 minutes after a stop or force kill: the supervisor checks every 2 seconds (about 1,800 an hour), and the worker checks each running job for messages and stops every 10 seconds (360 an hour per job; every 3 seconds, 1,200 an hour, for desktop control).
- Claude's own calls to your connector, one per tool call.
- The connector's every-minute schedule check: 1,440 runs a day. Cloudflare's page doesn't say whether these count toward the 100,000.

I measured the idle numbers on a Mac against a local test connector that counts requests, for 5 minutes each: 51,840 a day before 0.9.1 (the supervisor checked every 2 seconds all the time) and 14,400 a day once it settles. To see your own use, open your Worker in the Cloudflare dashboard.

Jobs run while your Mac is on and you're logged in. One install per Mac user account.

### Phone notifications and Remote Control

**Remote Control** is a Claude Code feature from Anthropic. It links a Claude Code session running on your computer to the Claude app on your phone, so that session can talk to you there. Anthropic explains it on the [Remote Control page](https://code.claude.com/docs/en/remote-control).

Nuff Said uses it for one thing: notifications, and only if you turn them on. Then the installer starts one Claude Code session on your Mac with Remote Control on, and keeps it running. You may see it in the Claude app as "Daisy bell" (or your assistant's name). Leave it running. When a job finishes, the worker tells that session, and the session sends your phone a notification through the Claude app. Claude Code decides when to push, and Anthropic says "the server can still suppress the mobile push when it detects that you are active" ([Environment variables](https://code.claude.com/docs/en/env-vars)), so a push can be skipped.

The bell also uses Claude Code channels, a research preview from Anthropic ([Channels](https://code.claude.com/docs/en/channels)), so the worker can hand the session each finished job. The bell's channel isn't on Anthropic's approved list, so the bell starts Claude Code with its developer flag for channels, `--dangerously-load-development-channels server:daisy-bell`. That flag shows a warning that Anthropic meant for people testing their own channels, and its answer is "I am using this for local development." That warning comes back every time the bell starts, and nobody is at that terminal to answer it, so **if you turn on phone notifications, the bell picks that answer for you each time it starts**. It also says yes to Claude Code's question about the bell's own MCP server. The installer says this in the question itself, and the bell stays off unless you say yes: pressing Enter and `--yes` leave it off, and an update from a version before the question asks again and leaves it off unless you type yes (with no terminal, that update stops and changes nothing until you run it in Terminal or add `--yes`). The session loads only Daisy's channel, none of your other connectors.

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

- **Treat the connector URL and its key like a password.** Anyone who has the URL can use your connector through their own Claude or the Claude API, and those calls come from Anthropic's servers just like yours, so they count as you. With the command line on (the default), that means running any command on your computer and reading the result, right away, with no approval step. With it off, they can still queue code jobs, and a code job runs Claude Code with its own command line. The key is the long part near the end of the URL. It's saved in `.connector-url` and `.connector-key` in your install folder, readable only by you. Keep both out of screenshots, screen recordings, chats, issues and bug reports.
- **Your Cloudflare account is a key too.** Your Mac runs whatever jobs and commands are in your connector's database. Anyone who can deploy to that Worker or change its database, including other members of the Cloudflare account, can run commands on your Mac as you, and their jobs show as yours. Install it on a Cloudflare account only you control, check that `npx -y wrangler@4.151.3 whoami` shows that account before you run the installer (if it says you're not signed in, that's fine: the installer signs you in and prints the account it used), and turn on two-factor authentication for it ([SECURITY.md](SECURITY.md#whats-yours-alone)).
- **Jobs run as you.** A job runs Claude Code with your files and your sign-ins, so it can also read your connector URL and keys in the install folder. A job tricked by a web page or email could use them. Install it on a computer you're comfortable trusting it with.
- **The command line and desktop control are on by default.** Claude can run shell commands on your computer from the conversation, take screenshots of your screen, and click and type on your desktop. To turn them off, answer no to the installer's question or run it with `--no-power-lanes`. Off, those tools are hidden from Claude and your computer refuses them too. Turning them off is not a sandbox: code and design jobs still run Claude Code with its normal tools, including its own command line, inside the folders you send them to. If you already installed, run `node install.mjs --update --no-power-lanes` from the release folder (or `--update --power-lanes` to turn them back on). Your connector URL stays the same.
- **Send, post, spend and delete need your yes.** Jobs stop and ask before any of those unless your request asked for it. For desktop control, email and publishing, the built-in tools stop for your yes in code. A code or design job still has its own command line, though, so a job tricked by a web page or email could reach your desktop, Composio or other apps another way. For everything else a job does, the stop is an instruction to Claude, and a well-made trick can get past an instruction.
- **Agents can't give that yes.** Every job, thread, schedule, routine, message, reply, approval, cancel and stop records who sent it. Your own Claude chat reaches the connector from Anthropic's servers, so it's recognized as you. A script or agent that calls the URL directly, like a job on your computer, is labeled as an agent. The connector refuses its approvals and its answers to a job waiting for your yes, and it can't publish, share, use the run-command tool, look at or use your desktop (including by retrying, replying to or messaging one of your desktop or screen jobs, or by restarting the worker while one runs), or undo stop everything. What it starts is marked as an agent's, and the job is told that isn't your approval. Agents can still start work, including ordinary jobs that run Claude Code with its command line, message each other and keep working. This is a check on where the call comes from, not a login: anything else that reaches your connector through Anthropic, like someone else's Claude or the Claude API with any key, comes from the same addresses and counts as you. So could a job on your computer that starts its own Claude session using the connectors in your Claude account: jobs are started with those connectors switched off, but a job can switch them back on. That's why the URL is a password.
- **Letting a lead agent approve for you is off.** `--lead-agent NAME` turns it on for one named agent. It can approve and answer jobs waiting for your yes, with limits: it can't approve sending a held email, and its approval never lets a desktop job send, post, buy or pay, even when your own request allowed it or a restart left the job waiting; those come back to you. It still can't publish, share, or use the run-command and desktop tools. Its approvals are logged as that agent, never as you, and a run it approved doesn't publish until you say so. The catch: it proves itself with a key file, `.lead-agent-key`, and any job on your computer can read that file, so a job that was tricked by a web page or email could approve for you too. Leave it off unless you need it. To turn it off: `node install.mjs --update --no-lead-agent`. Your connector URL stays the same.

Read [SECURITY.md](SECURITY.md) for the details.

---

## Install (Mac)

1. Download **[nuff-said.zip](https://github.com/prophet316/daisy-handoff-release/releases/latest/download/nuff-said.zip)** and unzip it.
2. Open Terminal (Applications > Utilities > Terminal), go to the folder, and run the installer:
   ```bash
   cd ~/Downloads/nuff-said
   node install.mjs
   ```
   It checks your Node version and Claude Code first and tells you what's missing. If Terminal says `command not found: node`, install Node first ([TROUBLESHOOTING.md](TROUBLESHOOTING.md#node-is-missing-or-too-old)).
3. Answer five questions (your name, what you call your assistant, what you call this computer, whether jobs may use the command line and control your desktop, and whether to turn on phone notifications; the command line question is on if you press Enter or type yes and off if you type no, and phone notifications stay off unless you type yes; any other answer is asked again). Before the last question it says what the phone bell answers for you; see [Phone notifications and Remote Control](#phone-notifications-and-remote-control).
4. Sign in to Cloudflare when your browser opens.
5. In Claude on the web (claude.ai) or the desktop app, go to **Customize > Connectors**, click **+ Add**, choose **Add custom connector**, name it **Nuff Said**, paste the URL the installer copied for you, and click **Continue**. Claude shows the authentication settings it detected; click **Continue** again. Under **Authentication**, choose **No sign in**, leave **Request headers** empty, and click **Add**. Your key is already in the URL. (Anthropic's steps: [Get started with custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).) Then copy something else, so the URL isn't left on your clipboard or in a clipboard history.
6. Open the Claude app. If **Nuff Said** isn't on for the chat yet, tap **+**, choose **Connectors** and turn it on (Anthropic says to turn a connector on for each conversation: [Use connectors](https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities)). Then start voice and say: **"Check updates with Daisy."** (or whatever you named your assistant). You're still talking to Claude; the name tells Claude to use your connector.
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

That's it. The update keeps your keys, so your connector URL stays the same and there's nothing to redo in Claude. It also keeps your connector and database on Cloudflare, your answers from last time (name, time zone, the command line switch, the lead agent), your job and thread folders, your logs and your worker settings: the numbers, on/off choices and Composio account names in `worker/config.json`. Every program path, command and file path in that file comes from the new release, and the update lists anything from the old file it didn't keep (the old file stays in the `.bak` folder). It keeps the phone bell on or off as you left it. An install from before 0.9.1 has no answer on record, so the update asks; pressing Enter or `--yes` turns the bell off. To change one answer while you update, add its flag, for example `--no-power-lanes`, `--no-lead-agent`, `--no-bell` or `--time-zone Europe/London`. Jobs that are running when the worker restarts start again.

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

It first deploys your connector's code again from the install folder and removes any secret on the connector that Nuff Said doesn't set, so code someone put there with your Cloudflare sign-in is gone before any new key exists. Then it changes the connector key, on Cloudflare and on your Mac, so the old URL stops working right away. Then it lists every schedule, routine, running job and job waiting to run, with who set each one up, and asks whether to turn them all off and stop the jobs. Anyone who had your URL could have saved some through Claude, and then they show as yours, so check every one. The worker keeps running while you read the list. After that it changes the worker key and the lead agent key if you have one, and right away restarts the worker and supervisor on the new keys: jobs you chose to stop stay stopped, a running desktop or screen job waits for your yes (it may already have sent something), and other running jobs start again from the beginning. It checks that the new URL works and the old one is turned away, which takes a few seconds. `node install.mjs --clear-schedules` turns them all off later.

Then in Claude, remove the old connector under **Customize > Connectors**, and don't add the new URL yet. Whoever had the URL could queue jobs, and a code job runs Claude Code with its own command line even when the command line switch is off, so do the steps below first, whichever way the switch was set. Your job history stays.

Changing keys locks out the old URL. It doesn't undo what someone already did with it. Assume someone ran commands as you, whether or not the command line was on: a code job has its own command line. They could read anything you can on the Mac: the Cloudflare sign-in the installer saved, your Claude Code sign-in, your GitHub login and other tokens. Then also:

- **Cloudflare:** run `npx -y wrangler@4.151.3 logout` in the install folder; in the Cloudflare dashboard revoke other sessions (**My Profile > Sessions**), roll your API tokens (**My Profile > API Tokens**) and read the **Audit Logs** for changes you didn't make; sign in again with `npx -y wrangler@4.151.3 login` and run `node install.mjs --update` from a fresh download of the release.
- **Claude:** on claude.ai, **Settings > Account**, log out of all sessions (that logs Claude Code out too), then sign in again.
- **GitHub:** revoke **GitHub CLI** at github.com/settings/applications (`gh auth logout` alone doesn't revoke anything) and delete tokens you don't need.
- **Logs:** `logs/shell.log` can be changed by the same commands. The connector keeps its own list on Cloudflare; [SECURITY.md](SECURITY.md#assume-someone-ran-commands-as-you) has the command to read it, what else to check, and every step above in full. Finding nothing doesn't prove nothing happened.
- **Last:** run `node install.mjs --rotate-keys` once more, from the fresh download, and only then add the connector in Claude with that URL. Until then, treat the keys from the first key change as seen: a copied Cloudflare or Claude sign-in, or something left running on the Mac, could have read them.

---

## Isn't this already built into Claude?

Partly, and that's good. Anthropic keeps adding to this, so check their pages for what's current.

**The new Claude experience** (chat and Cowork in one) lets voice mode keep going "in any conversation, including ones where Claude is working on a task", and voice mode can use the tools you've connected ([Use voice mode](https://support.claude.com/en/articles/11101966-use-voice-mode)). If that covers what you need, use it.

**Dispatch** in Claude Cowork lets you "message Claude from your phone and have it work on your desktop computer", with a push when a task is done or needs your go-ahead. It's Anthropic's own and needs nothing beyond the Claude apps. Today it's "in limited beta on some Pro and Max plans" and "isn't available to new users" ([Assign tasks from anywhere in Claude Cowork](https://support.claude.com/en/articles/13947068-assign-tasks-from-anywhere-in-claude-cowork)). If you have it, try it.

**Claude Code Remote Control** lets you use and start Claude Code sessions on your computer from your phone ([Remote Control](https://code.claude.com/docs/en/remote-control)). Use it. Nuff Said uses it too, for the session that sends your phone notifications.

**Projects in Claude Code** give you one ongoing conversation where Claude starts a thread for each task and runs them side by side. It shows which ones are waiting on you, can pause everything at once, and can put work on a schedule. Threads usually run in the cloud, and you can ask for one to run on your own computer through Remote Control. You can use it in the Claude mobile app. It's a public beta on Pro and Max, rolling out gradually, with a waitlist ([Projects](https://code.claude.com/docs/en/claude-projects)). If you have it, try it.

**Agent view in Claude Code** (`claude agents`) is "one screen for all your background sessions: what's running, what needs your input, and what's done." The sessions run on your own computer, a supervisor process keeps them going after you close the terminal, and while agent view is open it notifies you when one needs your input, finishes or fails. It's a research preview ([Agent view](https://code.claude.com/docs/en/agent-view)). If you work at your desk in a terminal, try it.

**Nuff Said** is for handing work to Claude Code on your own computer while you talk: one voice conversation in the Claude app that starts new jobs, checks on all of them, approves the ones waiting on you, and puts work on a schedule, through a connector and database on your own Cloudflare account. The worker is its own background service on your Mac, separate from the Claude desktop app. It lets you talk to Claude in the phone app's live voice mode while Claude Code on your own Mac runs the jobs, with a queue, named threads, schedules, approvals and a stop switch around them.

When Anthropic ships all of this natively, use theirs.

---

## Why this exists

Claude's voice mode is my favorite place to think out loud. But back then it couldn't hand work to Claude Code on my computer.

So every time a thought turned into a task, I had to stop talking, open the laptop, find the right session, type it all out, and come back later. The typing wasn't the problem. Losing the thread was.

Nuff Said removes that switch. The idea stays in the conversation and the work goes to the computer.

---

## Run the tests

Everything here runs offline and deploys nothing. The tests need Node 22.13 or newer. If this Mac also has a real install, run `--update --no-bell` and `--uninstall` against a `--home` test folder only with `--dry-run`, and `--rotate-keys` only with `--dry-run` or `--no-start`: launchd acts on the label inside the plist, and the labels are the same, so a real run would stop your real install's background services. For the same reason, if you start a test install's supervisor by hand, first set `supervisor.workerLabel` and `supervisor.bellLabel` in its `worker/config.json` to names of your own; otherwise its self-heal can restart your real worker.

```bash
# in the release folder (the zip has the test folder too): a throwaway install, then its checks
node install.mjs --dry-run --yes --home /tmp/nuff-test
node test/verify-dry-run.mjs /tmp/nuff-test daisy-handoff darwin
node test/doctor-no-leak.mjs
node test/update-resume.mjs
node test/overlay-build.mjs   # builds the blue glow helper into throwaway folders (needs the Command Line Tools)
# in that install (or yours): the desktop gate, the host lane, the command line switch, who-sent-it,
# stopping a job by its session, the schedule math in several time zones, redaction, the bell and its startup prompts
cd /tmp/nuff-test/Projects/daisy-handoff && ./test.sh gate
# or one at a time
node test/time-unit.mjs
node worker/shell-lane.mjs --shell-selftest
```

The workflow in [installer.yml](https://github.com/prophet316/daisy-handoff-release/blob/main/.github/workflows/installer.yml) is set up to run the installer dry run, update and key change, and the time zone, redaction and bell prompt tests on GitHub's macOS and Windows runners, plus `./test.sh gate` on macOS. For 0.9.1 it didn't run: GitHub Actions was blocked on the account. Every test above was run by hand on one Mac (macOS 26.4, Node 22.23) with the command line and desktop control on and off. Nothing was run on Windows. [RELEASE_NOTES.md](RELEASE_NOTES.md) lists exactly what ran.

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

[FSL-1.1-MIT](LICENSE). Free to use, change and share for anything except offering it, or something built on it, in a commercial product or service that competes with it. Each version becomes plain MIT two years after its release. The [LICENSE](LICENSE) is the real terms.
