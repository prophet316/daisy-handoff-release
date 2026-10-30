# Security

Daisy Handoff lets a voice conversation give work to your computer. Take that seriously. This page says what protects you and what doesn't.

## Report a problem

Use **Security > Report a vulnerability** on this repo (private to the maintainer). Please don't open a public issue for a security problem. You'll get a reply within 7 days.

| Version | Security fixes |
| ------- | -------------- |
| 0.9.x   | yes            |

## Hearing about security fixes

Daisy Handoff doesn't check for updates by itself. On this repo's GitHub page, click **Watch > Custom**, tick **Releases** and click **Apply**, and GitHub tells you about every new release. When a release fixes a security problem, its release notes and CHANGELOG.md say so at the top, and the fix is described in a security advisory under this repo's **Security** tab. To update, follow [Updates and security fixes in the README](README.md#updates-and-security-fixes).

## What's yours alone

- **Your own connector.** The installer deploys a Cloudflare Worker and D1 database to *your* Cloudflare account. No shared server. The maintainer can't see your jobs.
- **Keys made on your machine.** Three random 256-bit keys, created by the installer, stored in the install folder readable only by you (mode 600 on macOS, owner-only ACL on Windows). They are never printed, logged or put in the install receipt.
- **No open ports.** The worker makes outbound HTTPS calls to your connector. Nothing on the internet can connect to your computer through it.

## What the keys do

| Key | Where it lives | What it unlocks |
| --- | -------------- | --------------- |
| Connector key | inside your connector URL | Lets Claude (you) list, add and manage jobs |
| Worker key | `.worker-key` and Cloudflare secret | Lets your computer pick up jobs |
| Bell key | `.bell-key` | Lets the worker send your phone a notification |
| Lead agent key (only with `--lead-agent`) | `.lead-agent-key` and Cloudflare secret | Lets that one agent approve held actions for you |

**The connector URL is the password.** Anyone with it can queue jobs that run on your computer as you. Keep it out of screenshots, chats, issues and screen recordings.

## Know before you turn it on

- **It ships with the command line and desktop control turned on, the way the author uses it.** That means a job can do anything you can do at your keyboard: run commands, change or delete files, open apps, and click and type on your desktop, using your logins. A leaked connector URL or a prompt injection in a web page or email could cause real damage. Sends, posts, spending, deletes and access changes stop for your yes unless you asked for them. That lowers the risk but doesn't remove it. Install it only on a computer you trust it with. Desktop control is Mac only for now.
- **Jobs run as your user.** They run Claude Code with your files and your sign-ins.
- **Turning the command line and desktop control off.** Answer no to the installer's question, or run it with `--no-power-lanes`. That sets `POWER_LANES = "off"` in `wrangler.toml` and `"powerLanes": false` in `worker/config.json`, and `install-receipt.json` records the choice. Off means four tools are gone: run_command and command_result (shell commands on your computer straight from the conversation), look_at_screen (screenshots of your screen) and use_computer (Claude clicks and types on your desktop). Claude doesn't see them, the connector refuses them if called, and the worker and supervisor on your computer refuse those jobs and commands as well. Turning them off is not a sandbox: code and design jobs still run Claude Code with its normal tools, including its own command line, inside the folders you send them to.
- **Changing it after you install.** Run `node install.mjs --uninstall`, then `node install.mjs --force --no-power-lanes` (or `--power-lanes` to turn them back on). The old install folder is kept as a backup. You get a new connector URL, so add the connector in Claude again and remove the old one.
- **Prompt injection is real.** A job that reads a web page or an email can meet text written to trick it. The built-in gate stops before sending, posting, sharing, spending, deleting or changing access unless your own request asked for that. It lowers the risk. It doesn't remove it.
- **Approvals are explicit.** Anything waiting on you shows as needs approval. Nothing goes ahead until you say yes. Only your own Claude chat can say it: requests from anywhere else (an agent or job on your computer, or a script) are labeled as agents, and the connector refuses their approvals. Claude's connector traffic comes from Anthropic's published range, `160.79.104.0/21`, which Cloudflare checks, so a local agent can't pass as you. Someone who has your URL and their own Claude account could, which is one more reason to treat the URL as a password.
- **Lead agent (off by default).** `--lead-agent NAME` lets one named agent approve for you, logged as that agent, never as you. It uses `.lead-agent-key`, which any job on this computer can read, so a tricked job could approve too. Leave it off unless you need it.

## If your connector URL leaks

Rotate the connector key. In Terminal, in your install folder (`~/Projects/daisy-handoff` unless you named your assistant something else):

```bash
openssl rand -hex 32 | tr -d '\n' > .connector-key
npx -y wrangler@4.151.3 secret put CONNECTOR_KEY < .connector-key
printf '%s/%s/mcp' "$(node -p "require('./worker/config.json').base")" "$(cat .connector-key)" > .connector-url
pbcopy < .connector-url
```

Then in Claude, remove the old connector (Customize > Connectors; on Team and Enterprise, an Owner uses Organization settings > Connectors) and add it again with the new URL, which is now on your clipboard. The old URL stops working within a few seconds of the new secret being saved. The worker on your computer uses its own key, so it keeps running and your jobs and history stay.

## Removing it

See [Uninstall in the README](README.md#uninstall). In short: `node install.mjs --uninstall` stops the worker and moves its startup entries to a backup folder; `npx -y wrangler@4.151.3 delete --force` and `npx -y wrangler@4.151.3 d1 delete daisy-handoff-jobs -y`, run in the install folder, delete the connector and its database from Cloudflare; then delete the install folder and remove the connector in Claude.

## Not affiliated

This is an independent project. It is not affiliated with, made, reviewed or endorsed by Anthropic. Claude and Claude Code are trademarks of Anthropic.
