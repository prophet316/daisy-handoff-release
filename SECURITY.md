# Security

Nuff Said lets a voice conversation give work to your computer. Take that seriously. This page says what protects you and what doesn't.

## Report a problem

Use **Security > Report a vulnerability** on this repo (private to the maintainer). Please don't open a public issue for a security problem. You'll get a reply within 7 days.

| Version | Security fixes |
| ------- | -------------- |
| 0.9.x   | yes            |

## Hearing about security fixes

Nuff Said doesn't check for updates by itself. On this repo's GitHub page, click **Watch > Custom**, tick **Releases** and click **Apply**, and GitHub tells you about every new release. When a release fixes a security problem, its release notes and CHANGELOG.md say so at the top, and the fix is described in a security advisory under this repo's **Security** tab. To update, follow [Updates and security fixes in the README](README.md#updates-and-security-fixes).

## What's yours alone

- **Your own connector.** The installer deploys a Cloudflare Worker and D1 database to *your* Cloudflare account. No shared server. The maintainer can't see your jobs. Your Claude chats, including what Claude reads back from your jobs, and the bell's Remote Control session are stored by Anthropic like any other Claude conversation, and your jobs' records are stored on your Cloudflare account.
- **Keys made on your machine.** Three random 256-bit keys (four with a lead agent), created by the installer, stored in the install folder readable only by you (mode 600 on macOS, owner-only ACL on Windows). They are never printed, logged or put in the install receipt. If a job writes one of them, or your connector URL, into a file, its summary or an email draft, it's replaced with `[redacted]` before it leaves your computer: in live reads, in the files and result stored when the job ends, in the phone notification, and in a held email, which then can't be sent. This catches a key written as is. A job that changes it first, for example by encoding it, isn't caught, so redaction stops accidents, not a tricked job.
- **No open ports.** The worker makes outbound HTTPS calls to your connector. Nothing on the internet can connect to your computer through it. That doesn't make it safe on its own: your connector URL is the way in, so treat it like a password.

## What the keys do

| Key | Where it lives | What it unlocks |
| --- | -------------- | --------------- |
| Connector key | inside your connector URL | Lets Claude (you) list, add and manage jobs, and, with the command line on, run commands on your computer |
| Worker key | `.worker-key` and Cloudflare secret | Lets your computer pick up jobs. Anyone holding it could take your jobs and their details off the queue and post results |
| Bell key | `.bell-key` | Lets the worker send your phone a notification |
| Lead agent key (only with `--lead-agent`) | `.lead-agent-key` and Cloudflare secret | Lets that one agent approve held actions for you, except sending a held email, and its approval never lets a desktop job send, post, buy or pay. It can't publish, share, or use the run-command and desktop tools |

**The connector URL is the password.** Anyone with it can queue jobs that run on your computer as you. Through their own Claude or the Claude API they count as you (see below), and with the command line on (the default) they can run any command on your computer and read the result, right away, with no approval step. Keep it out of screenshots, chats, issues and screen recordings.

## Know before you turn it on

- **It ships with the command line and desktop control turned on, the way I use it.** That means a job can do anything you can do at your keyboard: run commands, change or delete files, open apps, and click and type on your desktop, using your logins. A leaked connector URL or a prompt injection in a web page or email could cause real damage. Sends, posts, spending, deletes and access changes stop for your yes unless you asked for them. That lowers the risk but doesn't remove it. Install it only on a computer you trust it with. Desktop control is Mac only for now.
- **Pro and Max only for now.** On Team and Enterprise, an admin (an Owner, or on Enterprise someone whose role can manage connectors) adds a custom connector for the organization, and people across it can then connect to it. Every call through Claude counts as you, so anyone in the organization who connects could run commands on your Mac. Don't add your connector URL to a shared organization.
- **Jobs run as your user.** They run Claude Code with your files and your sign-ins. Jobs run as you, so a job can read your connector URL and keys in the install folder. A job tricked by a web page or email could use them.
- **The phone bell uses a research preview.** The bell is a Claude Code session that gets each finished job through Claude Code channels, a research preview from Anthropic ([Channels](https://code.claude.com/docs/en/channels)). The bell's channel isn't on Anthropic's approved list, so the bell starts Claude Code with `--dangerously-load-development-channels server:daisy-bell`. That flag shows a warning that Anthropic meant for people testing their own channels, and its answer is "I am using this for local development." That warning comes back every time the bell starts and nobody is at that terminal, so the installer explains this in its phone notification question, and the bell stays off unless you say yes (pressing Enter and `--yes` leave it off, and an update from a version before the question asks again and leaves it off unless you type yes; with no terminal, that update stops and changes nothing until you run it in Terminal or add `--yes`); if you say yes, the bell picks that answer for you each time it starts, and says yes to the question about the bell's own MCP server. Its startup answers stop once Remote Control is up, or after 90 seconds: after that it no longer reads the session's screen, so job text shown there can't trigger a keystroke, and the MCP answer needs that prompt's own options on screen. To turn the bell off, run `node install.mjs --update --no-bell` (`--update --bell` turns it on). Jobs work the same without it. The installer also marks the bell's own folder as trusted in `~/.claude.json`, the answer you'd give to Claude Code's trust question, because nobody is at that terminal to answer it. The session loads only that channel (`--strict-mcp-config`), none of your other connectors. Anthropic says channels may change, so a Claude Code update could stop notifications until Nuff Said is updated.
- **Turning the command line and desktop control off.** Answer no to the installer's question, or run it with `--no-power-lanes`. That sets `POWER_LANES = "off"` in `wrangler.toml` and `"powerLanes": false` in `worker/config.json`, and `install-receipt.json` records the choice. Off means four tools are gone: run_command and command_result (shell commands on your computer straight from the conversation), look_at_screen (screenshots of your screen) and use_computer (Claude clicks and types on your desktop). Claude doesn't see them, the connector refuses them if called, and the worker and supervisor on your computer refuse those jobs and commands as well. Turning them off is not a sandbox: code and design jobs still run Claude Code with its normal tools, including its own command line, inside the folders you send them to.
- **Changing it after you install.** From the release folder run `node install.mjs --update --no-power-lanes` (or `--update --power-lanes` to turn them back on). Your keys and connector URL stay the same, and the old install folder is kept as a backup.
- **Prompt injection is real.** A job that reads a web page or an email can meet text written to trick it. Jobs are told to stop before sending, posting, sharing, spending, deleting or changing access unless your own request asked for that. For desktop control, email and publishing, the built-in tools stop for your yes in code. The desktop gate keeps its record of what it held, and the job's lane and hook settings and its message inbox, in `~/.daisy/runs/` (named after your assistant), outside the job folder, so a computer job can't change what your yes unlocks. The approval card says what the gate held, on the first hold and on every later hold, including one from a run you already approved. A purchase is paid only after a card you saw: the worker records that card outside the job folder, an old `purchase.json` in the job folder can't turn the charge back on, and every desktop run (approved, reply or retry) moves an old one aside before it starts. The items, total and address on that card are what the job read off the order page, not something Nuff Said checked; the card says so. Look at the order page before you approve a large one. A code or design job still has its own command line, though, so a job tricked by a web page or email could reach your desktop, Composio or other apps another way, or write to any file you can, Nuff Said's own included. Jobs are refused the usual `composio` and `cua-driver` commands, but that only catches the usual way of calling them; it isn't a boundary. For everything else a job does, the stop is an instruction to Claude, and a well-made trick can get past an instruction. It lowers the risk. It doesn't remove it.
- **What a job brings back can trick Claude too.** Job titles, details, results, files and command output are read into your own Claude chat, and calls from your chat count as you. Text a job copied from a web page or email, or a title an agent wrote, could ask Claude to run a command, approve a job or use your desktop. The connector returns that text between `<job-output>` tags under a label that says it's untrusted job output and never instructions from you, takes out any such tag inside the text so it can't end the fence early, names the agent that made a job, and tells Claude never to call run_command, use_computer, look_at_screen, approve_job, publish_job, resume_all, reply_to_job, retry_job or add_job because job text asks. That is an instruction to Claude, not a lock: a chat that can run commands could still be steered by what a job brings back, and nothing in the connector can tell your request apart from Claude acting on planted text. Read what Claude is about to run or approve before you allow it, and turn the command line off if you don't need it. The interactive job card shows a result without the label; Claude reads the labeled text.
- **Approvals are explicit.** Anything waiting on you shows as needs approval, and the connector doesn't let it go ahead until a yes comes from your own Claude chat. Requests from anywhere else (an agent or job on your computer, or a script) are labeled as agents. What the connector enforces for them:
  - It refuses their approvals and their answers to a job waiting for your yes.
  - It refuses publish and share, run_command and command_result, look_at_screen and use_computer, and resume_all (they can still stop everything, and that stop is recorded as theirs). It also refuses an agent's retry, reply or mid-run message on a desktop or screen job, because that run would keep what you allowed the first time (a send, say) or take a new screenshot; the worker refuses such a run too if one gets through. A restart doesn't start a desktop or screen job again by itself, even one you allowed to send: an agent can ask for a restart, so after one the job waits for your yes and says it may be partly done.
  - If an agent retries or replies to one of your jobs that publishes or shares, sends it a message while it runs, or the lead agent approves it, the work runs but the publish waits for you: the worker finishes it as done and you say "publish it" (publish_job).
  - A held email is checked against your own words only: the title and details of a job an agent made, and a note an agent sent, never count as an address you gave. The job card shows the held email (who made the job, sender, recipients, subject and body) above its Approve button.
  - Everything they start or change is recorded as theirs: jobs, threads, schedules, routines, replies, retries, cancels and force-kills. A run of a schedule or routine an agent saved is marked as that agent's, never as your saved approval, and the job is told so. An agent replacing one of your routines makes its later runs the agent's too.

  What it can't do: tell you apart from anything else that reaches your connector through Anthropic. Claude's connector traffic comes from Anthropic's published range, `160.79.104.0/21`, and Cloudflare checks it, which stops a script or job on your computer from passing as you by calling the URL directly. It is not proof of identity: someone with your URL and their own Claude account, or a program using the Claude API's MCP connector with any API key, comes from the same range and counts as you. A job on your computer could do that too: it can start its own Claude Code session, which can use the connectors in your Claude account, or use an API key someone gives it. Jobs are started with `ENABLE_CLAUDEAI_MCP_SERVERS=false`, so a Claude session a job starts doesn't load your Claude account's connectors, but a job can unset that. So a tricked job could approve for you. That's one more reason to treat the URL as a password.
- **Lead agent (off by default).** `--lead-agent NAME` lets one named agent approve for you, logged as that agent, never as you. That's all it adds, with two limits: it can't approve sending a held email (the connector refuses, and the worker won't send one it approved), and its approval never unlocks send, post, buy or charge for a desktop job, so those stop again for your yes. Like any agent, it can't publish, share, or use run_command, look_at_screen or use_computer. It uses `.lead-agent-key`, which any job on this computer can read, so a tricked job could approve too. Leave it off unless you need it. To turn it off: `node install.mjs --update --no-lead-agent`. Your connector URL stays the same, and its key is removed from Cloudflare.

## If your connector URL or a key leaks

In Terminal, in an unzipped release folder (the newest you have; it finds your install in `~/Projects`):

```bash
node install.mjs --rotate-keys
```

It first deploys the connector code from the install folder again and removes any secret on the connector that Nuff Said doesn't set (an `OWNER_CIDRS` secret, for one, would make every caller count as you), so code someone put on your connector with your Cloudflare sign-in is gone before a new key is made. Storing a secret on Cloudflare hands it to whatever code is deployed then, which is why the clean code goes first. Then it changes the connector key, on Cloudflare and then in the install folder, so the old URL is turned away at once. Then it lists every schedule, routine, running job, queued job and job waiting for your yes, with who set each one up, and asks whether to turn them all off and stop the jobs. Someone with your old URL could have saved them through Claude, and then they show as yours, so check every one. The worker keeps its old key while you answer, so a job that finishes then still reports back. Then it changes the worker key and the lead agent key (if you turned that on) and right away restarts the worker and supervisor on the new keys: running jobs you chose to stop are cancelled, not put back in the queue, a running desktop or screen job waits for your yes, and other running jobs start again from the beginning. It checks that the new URL answers and the old one gets HTTP 404. `node install.mjs --clear-schedules` turns them all off at any time. The bell key stays: it only works from your own computer.

Then in Claude, remove the old connector (Customize > Connectors). If the command line was off while the URL was out, add it again with the new URL, which is now on your clipboard; copy something else afterwards. If it was on, wait until step 7 below. Your job history stays.

Changing keys locks out the old URL. It doesn't undo what someone already did with it. And while the old Cloudflare sign-in still works, whoever copied it can deploy their code again after this key change and read the new keys, so if the command line was on, finish the steps below, which end with a second key change (step 7).

With no terminal (a script, or Claude Code running it for you), `--rotate-keys` stops before changing anything unless you add `--yes` (keeps schedules) or `--clear-schedules`.

### If the command line was on

Assume someone ran commands as you. Those commands can read anything you can read on the Mac, so treat these as copied:

- **Your Cloudflare sign-in.** The installer signed you in with `wrangler login`, and Cloudflare says wrangler by default "stores the OAuth access token and refresh token ... in a plaintext TOML file" in your home folder ([Wrangler commands](https://developers.cloudflare.com/workers/wrangler/commands/general/)); on a Mac, `npx -y wrangler@4.151.3 whoami` shows where (on a test Mac it was `~/Library/Preferences/.wrangler/config/default.toml`). With it, someone can deploy their own code to your connector and read or change your job database. Output redaction catches that file only if it's printed as is (see "What the keys do").
- **Your Claude sign-in.** Jobs run Claude Code as you, so a command can use your Claude Code login, and may be able to copy it.
- **GitHub and other tokens.** The GitHub CLI's login (`gh auth token` prints it), SSH keys, and any key or token kept in a file, such as `.env` files, `~/.npmrc` or cloud tool settings.

What to do, in this order:

1. Run `node install.mjs --rotate-keys` (above). It deploys the connector code from your install folder again before it makes the new keys.
2. **Cloudflare.** In the install folder run `npx -y wrangler@4.151.3 logout`. Cloudflare says this "will invalidate your current OAuth token and delete the stored credentials"; it doesn't say whether a copy taken earlier stops working too, so also do the next steps. In the Cloudflare dashboard, revoke every session you don't recognize under **My Profile > Sessions**, roll each API token under **My Profile > API Tokens** (Cloudflare: "Rolling your API token into a new one will invalidate the previous token"), and change the API key in the same place if you have one. Read the account's **Audit Logs** for deployments or changes you didn't make, and undo them ([Secure a compromised account](https://developers.cloudflare.com/fundamentals/get-started/basic-tasks/account-security/securing-a-compromised-account/)). Then sign in again with `npx -y wrangler@4.151.3 login`, download the release again, and run `node install.mjs --update` from the new folder, so both this Mac and your connector run the released code. (A command could have changed files in your install folder, including the code step 1 deployed.)
3. **Claude.** On claude.ai, go to **Settings > Account** and log out of all sessions. Anthropic says this "also logs you out of Claude Code" and "doesn't affect your API keys" ([Log out of all active sessions](https://support.claude.com/en/articles/10310342-how-do-i-log-out-of-all-active-sessions)). Then run `claude` and sign in again. If you keep a Claude Console API key on the Mac, delete it in the Console and make a new one.
4. **GitHub.** `gh auth logout` only removes the login from this computer; GitHub's manual says it "does not revoke authentication tokens". Revoke **GitHub CLI** at [github.com/settings/applications](https://github.com/settings/applications) (that ends every GitHub CLI token on every device), delete personal access tokens you don't need at [github.com/settings/tokens](https://github.com/settings/tokens), and check your SSH keys at [github.com/settings/keys](https://github.com/settings/keys).
5. **Everything else.** Change any other key, token or password kept in a file on the Mac.
6. **Look for what they ran and what they left.** `logs/shell.log` in your install folder lists the commands, but a command run that way can also change that file, so don't trust it alone. Your connector keeps its own list on Cloudflare. In the install folder run this (the database is `daisy-handoff-jobs` unless you named your assistant something else; the installer's list after `--rotate-keys` prints your real name):

   ```bash
   npx -y wrangler@4.151.3 d1 execute daisy-handoff-jobs --remote --command "SELECT created_at, arg FROM control WHERE kind='shell' ORDER BY id"
   ```

   Someone with your Cloudflare sign-in could change that list too, so compare it with the Audit Logs. Then check `crontab -l`, `~/Library/LaunchAgents`, Login Items in System Settings, `~/.zshrc` and `~/.ssh/authorized_keys` for anything you don't recognize. Changing keys doesn't remove something left running in the background. Finding nothing doesn't prove nothing happened; if you have any doubt, treat the Mac as compromised.
7. **Change the keys once more, then reconnect.** When the steps above are done, run `node install.mjs --rotate-keys` again from the fresh download, and only then add the connector in Claude with that URL. Until then, treat the keys from step 1 as seen: a copied Cloudflare or Claude sign-in, or something left running on the Mac, could have read them. Step 1 still comes first, because it shuts the old URL at once.

### Changing the keys by hand

In the install folder (`~/Projects/daisy-handoff` unless you named your assistant something else):

```bash
openssl rand -hex 32 | tr -d '\n' > .connector-key
npx -y wrangler@4.151.3 secret put CONNECTOR_KEY < .connector-key
printf '%s/%s/mcp' "$(node -p "require('./worker/config.json').base")" "$(cat .connector-key)" > .connector-url
openssl rand -hex 32 | tr -d '\n' > .worker-key
npx -y wrangler@4.151.3 secret put WORKER_KEY < .worker-key
npx -y wrangler@4.151.3 deploy
launchctl kickstart -k gui/$(id -u)/com.daisy.handoff-worker
launchctl kickstart -k gui/$(id -u)/com.daisy.supervisor
pbcopy < .connector-url
```

If you use a lead agent, do the same for `.lead-agent-key` and `LEAD_AGENT_KEY`. Then say "list my schedules" in Claude and cancel any you don't recognize.

## Removing it

See [Uninstall in the README](README.md#uninstall). In short: `node install.mjs --uninstall` stops the worker and moves its startup entries to a backup folder; `npx -y wrangler@4.151.3 delete --force` and `npx -y wrangler@4.151.3 d1 delete daisy-handoff-jobs -y`, run in the install folder, delete the connector and its database from Cloudflare; then delete the install folder and remove the connector in Claude.

## Not affiliated

This is an independent project. It is not affiliated with, made, reviewed or endorsed by Anthropic. Claude and Claude Code are trademarks of Anthropic.
