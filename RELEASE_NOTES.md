**Talk to Claude. Your computer does the work. You never leave Claude.**

Daisy Handoff is one custom connector you add in the Claude app. After that, a conversation with Claude, including a live voice conversation on your phone, can hand real work to Claude Code on your own computer: start jobs, run threads, check progress, approve, retry, schedule, and stop everything.

### Read this first
This release ships with the command line and desktop control turned on, the way the author uses it. That means a job can do anything you can do at your keyboard: run commands, change or delete files, open apps, and click and type on your desktop, using your logins. A leaked connector URL or a prompt injection in a web page or email could cause real damage. Sends, posts, spending, deletes and access changes stop for your yes unless you asked for them. That lowers the risk but doesn't remove it. To turn it off, answer no to the installer's question or run `node install.mjs --no-power-lanes`. Turning it off is not a sandbox: normal Claude Code jobs still run. Install it only on a computer you trust it with. Desktop control is Mac only for now.

### What's new in 0.9.1
- **Only your own Claude chat can approve.** Every job, thread, schedule, routine, message, reply, approval, cancel and stop records who sent it. Your own Claude chat is recognized as you, by the Anthropic address it calls from. Scripts and agents that call the URL directly are labeled as agents: the connector refuses their approvals, publishing and sharing, commands and desktop control, and what they start is marked as theirs, never as your approval. It's a check on where the call comes from, not a login: anything that reaches your connector through Anthropic, including the Claude API, counts as you, so the URL stays a password. SECURITY.md has the details.
- **Update in place.** `node install.mjs --update` keeps your keys, connector URL, Cloudflare connector and database, answers, job folders and settings. Nothing to redo in Claude.
- **Change every key at once.** `node install.mjs --rotate-keys` changes the connector, worker and lead agent keys, restarts the worker, and lists every schedule, routine and waiting job with who set it up, so you can clear anything planted while the URL was out.
- **Your own time zone.** Schedules and the times Claude reads out use your Mac's time zone, not US Central Time. `--time-zone NAME` picks another.
- **A doctor.** `node doctor.mjs` finds the common problems, says what to do about each, and saves a report with your keys removed. It only sends your key to the connector your install deployed.
- **Desktop control stays out of the Claude app** unless you name it, and treats express checkout buttons like "Buy with 1-Click" as the step that charges money.
- **The phone bell's folder is trusted at install.** On a new Mac, Claude Code asks whether to trust the folder the bell runs in, and nobody is there to answer. The installer now records that trust for you.
- **Help for first-time installers.** A troubleshooting page, a step-by-step manual install, an "Install problem" issue form, and a README that lists everything you need and what it costs before you start.
- **How to hear about updates.** The README explains how to get told about new releases and security fixes, and how to update.

### Install (Mac)
1. Download `daisy-handoff.zip` below and unzip it.
2. In Terminal, in that folder: `node install.mjs`
3. In Claude, go to Customize > Connectors, click +, choose Add custom connector, and paste the URL it copied.
4. Start voice and say: "Daisy, check updates."

Needs macOS 13 or newer, a paid Claude plan with Claude Code (Pro, Max, Team or Enterprise) signed in on this Mac, Node 22 or newer, Apple's Command Line Tools, and a free Cloudflare account. The README's What you need section has the details and costs. Try `node install.mjs --dry-run` first if you want to see everything it would do.

### Updating from 0.9.0
In the new release folder run `node install.mjs --update`. It keeps your keys, so your connector URL stays the same and there's nothing to redo in Claude. Schedules made under 0.9.0 used US Central Time; after the update they use your time zone, so check their times.

### What's tested in this release
- On a dry-run install, with the command line and desktop control on and off: `./test.sh gate` (desktop gate, host lane, the switch, who-sent-it), the shell lane, redaction, bell and time zone self-tests, and `test/verify-dry-run.mjs`.
- `test/doctor-no-leak.mjs`, and the installer dry run, update and key change on macOS and Windows (GitHub's clean runners).
- Update in place and key change against a throwaway Cloudflare connector, deleted afterwards. That run didn't include Claude, a phone or a real job.
- Time zones tested in Chicago, Los Angeles, London, Kolkata, Sydney, Tokyo and UTC.
<!-- TODO before release: replace or add the real-install line once a fresh install of 0.9.1 to a new Cloudflare connector has run end to end. Only list what was actually run. -->

### Known limits
- Mac today. The Windows worker is in testing and isn't in this release.
- Computer use (operating your desktop) is macOS only.
- Turning the command line and desktop control off is not a sandbox: code and design jobs still run Claude Code with its normal tools.
- Your connector URL is a password. Read SECURITY.md before you install.

### Verify your download
`daisy-handoff.zip.sha256` is attached, and this zip has a signed build provenance attestation:
`gh attestation verify daisy-handoff.zip --repo prophet316/daisy-handoff-release`

Daisy Handoff is an independent project, not affiliated with or endorsed by Anthropic. Claude is a trademark of Anthropic.
