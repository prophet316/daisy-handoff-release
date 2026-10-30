# Daisy Handoff

[![Latest release](https://img.shields.io/github/v/release/prophet316/daisy-handoff-release)](https://github.com/prophet316/daisy-handoff-release/releases/latest)
[![Installer CI](https://github.com/prophet316/daisy-handoff-release/actions/workflows/installer.yml/badge.svg)](https://github.com/prophet316/daisy-handoff-release/actions/workflows/installer.yml)
[![License: FSL-1.1-MIT](https://img.shields.io/badge/license-FSL--1.1--MIT-blue)](LICENSE)

**Talk to Claude on your phone. Your computer does the work.**

> [!WARNING]
> **Read this first.** Daisy Handoff ships with the command line and desktop control turned on, the way the author uses it. That means a job can do anything you can do at your keyboard: run commands, change or delete files, open apps, and click and type on your desktop, using your logins. A leaked connector URL or a prompt injection in a web page or email could cause real damage. Sends, posts, spending, deletes and access changes stop for your yes unless you asked for them. That lowers the risk but doesn't remove it. To turn it off, answer no to the installer's question or run it with `--no-power-lanes`. Install it only on a computer you trust it with. Desktop control is Mac only for now.

Daisy Handoff is a connector for Claude. It lets Claude's voice mode hand real work to Claude Code on your own computer: start a job, run an ongoing thread, check progress, approve, retry, schedule, and stop everything. You never leave the conversation.

Mac today, Windows next. The Windows worker is the next thing landing.

---

## What you need

| What | Cost | Notes |
| ---- | ---- | ----- |
| A Mac on macOS 13 (Ventura) or newer | | macOS 13 is the oldest version Claude Code supports. Tested on macOS 26. |
| A paid Claude plan: Pro, Max, Team or Enterprise | Pro is $20 a month ($17 a month billed yearly); Max starts at $100 a month | Claude Code isn't included in the Free plan, so Free can't run the jobs. Custom connectors and voice mode work on every plan. On Team and Enterprise, an owner has to allow the connector first. |
| Claude Code, installed and signed in on the Mac | Included with the plan | Install it from [claude.ai/code](https://claude.ai/code), run `claude`, and sign in. |
| The Claude app on your phone | Free | For voice. iPhone or Android. |
| Node 22 or newer | Free | From [nodejs.org](https://nodejs.org). The Cloudflare tool the installer uses needs Node 22. |
| A Cloudflare account | Free plan is enough | The free Workers plan allows 100,000 requests a day, and its free D1 database allows 5 million rows read and 100,000 rows written a day. Your computer checks in every 20 seconds, about 4,300 requests a day. |

---

## Why this exists

Claude's voice mode is the best place I've found to think out loud. But it couldn't reach my computer.

So every time a thought turned into a task, I had to stop talking, open the laptop, find the right session, type it all out, and come back later. The typing wasn't the problem. Losing the thread was.

Daisy Handoff removes that switch. The idea stays in the conversation and the work goes to the computer.

---

## What you can say

- "Have a worker clean up my downloads folder and tell me when it's done."
- "Start a thread called podcast site and rebuild the episode page."
- "What's running right now?"
- "What did the finances job find?"
- "Approve it." / "Retry it, but skip the old files."
- "Every weekday at 7, send me a news brief."
- "Stop everything."

31 tools out of the box: jobs, threads, routines, schedules, approvals, a daily digest, health check, an emergency stop, and the command line and desktop control (run a command, look at the screen, use the computer). With the command line and desktop control turned off, it's 27.

---

## How it works

```
You (voice, Claude app)
   -> Claude
   -> your connector (a Cloudflare Worker on YOUR free Cloudflare account)
   -> job queue
   <- worker on your computer checks in every 20 seconds
   -> Claude Code does the work, then you get a notification
```

When a job finishes, a Claude Code session on your Mac sends the result to your phone as a Claude app notification.

Your computer never opens a port. The worker reaches out to your connector; nothing reaches in. Every install has its own connector, its own database and its own keys. Nobody else's computer sees your jobs, including mine.

---

## Install (Mac, about 10 minutes)

1. Download **[daisy-handoff.zip](https://github.com/prophet316/daisy-handoff-release/releases/latest/download/daisy-handoff.zip)** and unzip it.
2. Open Terminal in that folder and run: `node install.mjs`
3. Answer four questions (your name, what you call your assistant, what you call this computer, and whether jobs may use the command line and control your desktop; the answer is yes unless you type no).
4. Sign in to Cloudflare when your browser opens.
5. In Claude, go to **Customize > Connectors > Add custom connector** and paste the URL the installer copied for you.
6. Open the Claude app, start voice, and say: **"Daisy, check updates."** (or whatever you named your assistant)

To see everything it would do first, run `node install.mjs --dry-run`. It builds the install in a throwaway folder and deploys nothing.

Your install lives in `~/Projects/daisy-handoff` (the name follows what you call your assistant, so an assistant called Max lives in `~/Projects/max-handoff`). Your connector on Cloudflare has the same name, and its database adds `-jobs` to it.

**Good to know in this version:**
- Schedules and times use US Central Time. Your own time zone is coming in a later release.
- Publishing to Google Docs and Drive and sending email need a separate [Composio](https://composio.dev) account. Everything else works without it.

**Windows:** Mac today, Windows next. The installer already runs on Windows, but the background worker doesn't yet. Windows worker support is the next thing landing.

---

## Update to a new release

1. Download the new **daisy-handoff.zip** and unzip it.
2. In Terminal, in the new folder: `node install.mjs --uninstall`
3. Then: `node install.mjs --force`, and give the same answers as last time (same assistant name, so it reuses your connector and database).
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

Use your own names if your assistant isn't called Daisy (for Max: `max-handoff`, `max-handoff-jobs` and `~/.max`). Claude Code, Node and your Cloudflare account stay; remove those separately if you want.

---

## Isn't this already built into Claude?

Partly, and that's good.

**Claude Code Remote Control** lets you open a session on your computer from the Code tab and type into it. Use it.

**Daisy Handoff** is for when you're talking, not typing: one voice conversation that can start new jobs, check on all of them, approve the ones waiting on you, and put work on a schedule.

When Anthropic ships all of this natively, use theirs.

---

## Before you install: what you're giving it

- **Treat the connector URL and its key like a password.** Anyone who has the URL can give your computer work. The key is the long part near the end of the URL. It's saved in `.connector-url` and `.connector-key` in your install folder, readable only by you. Keep both out of screenshots, screen recordings, chats, issues and bug reports.
- **Jobs run as you.** A job runs Claude Code with your files and your sign-ins. Install it on a computer you're comfortable trusting it with.
- **The command line and desktop control are on by default.** Claude can run shell commands on your computer from the conversation, take screenshots of your screen, and click and type on your desktop. To turn them off, answer no to the installer's question or run it with `--no-power-lanes`. Off, those tools are hidden from Claude and your computer refuses them too. Turning them off is not a sandbox: code and design jobs still run Claude Code with its normal tools, including its own command line, inside the folders you send them to. If you already installed, run `node install.mjs --uninstall`, then `node install.mjs --force --no-power-lanes`. That makes a new connector URL, so add the connector in Claude again.
- **Send, post, spend and delete need your yes.** Jobs stop and ask before any of those unless your request asked for it.

### If your URL leaks: rotate the key

In Terminal:

```bash
cd ~/Projects/daisy-handoff
openssl rand -hex 32 | tr -d '\n' > .connector-key
npx -y wrangler@4.151.3 secret put CONNECTOR_KEY < .connector-key
printf '%s/%s/mcp' "$(node -p "require('./worker/config.json').base")" "$(cat .connector-key)" > .connector-url
pbcopy < .connector-url
```

The old URL stops working within a few seconds. In Claude, remove the old connector under **Customize > Connectors** and add it again with the new URL (it's on your clipboard). Your jobs, history and worker carry on as before.

Read [SECURITY.md](SECURITY.md) for the details.

---

## Get help

Open an issue at [github.com/prophet316/daisy-handoff-release/issues](https://github.com/prophet316/daisy-handoff-release/issues) and pick **Something broke** or **Idea**. For a security problem, use **Security > Report a vulnerability** instead, so it stays private.

A good bug report has:

- What you said or ran, word for word, and what happened instead.
- The installer version (the first line it prints), your macOS version, `node -v` and `claude --version`.
- `install-receipt.json` from your install folder. It holds no keys.
- The last 30 lines of `logs/worker.log` in your install folder, if a job misbehaved. Read them first and cut anything private.

Never paste your connector URL, `.connector-url`, `.connector-key`, `.worker-key` or `.bell-key`. If one slips out, rotate the key (above).

---

## Credit

Built by Jonathan Gibson.

Other people have built voice tools for Claude Code too, and they are worth a look: [VoiceMode](https://github.com/mbailey/voicemode) and [claude-code-voice-skill](https://github.com/abracadabra50/claude-code-voice-skill).

Daisy Handoff is an independent project. It is not affiliated with, made by or endorsed by Anthropic. Claude and Claude Code are trademarks of Anthropic.


## License

[FSL-1.1-MIT](LICENSE). Free to use, change and share for anything except selling it as a competing product. Each version becomes plain MIT two years after its release.
