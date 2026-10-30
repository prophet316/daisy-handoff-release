**Talk to Claude on your phone. Your computer does the work.**

Daisy Handoff is a Claude connector that lets voice mode hand real work to Claude Code on your own computer: start jobs, run threads, check progress, approve, retry, schedule, and stop everything without leaving the conversation.

### Read this first
This release ships with the command line and desktop control turned on, the way the author uses it. That means a job can do anything you can do at your keyboard: run commands, change or delete files, open apps, and click and type on your desktop, using your logins. A leaked connector URL or a prompt injection in a web page or email could cause real damage. Sends, posts, spending, deletes and access changes stop for your yes unless you asked for them. That lowers the risk but doesn't remove it. To turn it off, answer no to the installer's question or run `node install.mjs --no-power-lanes`. Install it only on a computer you trust it with. Desktop control is Mac only for now.

### Install (Mac)
1. Download `daisy-handoff.zip` below and unzip it.
2. In Terminal, in that folder: `node install.mjs`
3. Paste the URL it copies into Claude: Customize > Connectors > Add custom connector.
4. Start voice and say: "Daisy, check updates."

Needs macOS 13 or newer, a paid Claude plan (Pro or Max) with Claude Code signed in, Node 22 or newer, and a free Cloudflare account. The README's What you need section has the details and costs. Try `node install.mjs --dry-run` first if you want to see everything it would do.

### What's tested in this release
- Installer dry run on macOS and Windows (GitHub's clean runners) and on the author's Mac Studio.
- A real install on the author's Mac Studio from this release's files, to its own new Cloudflare connector: deploy, keys, live check, and real jobs run end to end through the connector by Claude Code. About a minute from unzip to the first finished job, not counting your own steps in Claude and Cloudflare.
- The README's key rotation, update and uninstall steps, run on that install. Uninstall left nothing behind on Cloudflare or the Mac.

### Update and uninstall
The README has step-by-step update, uninstall and key rotation instructions.

### Known limits
- Mac today, Windows worker coming next: the background worker runs on macOS only for now. The Windows worker is the next thing landing.
- Computer use (operating your desktop) is macOS only.
- Schedules use US Central Time in this version.
- Turning the command line and desktop control off is not a sandbox: code and design jobs still run Claude Code with its normal tools.
- Your connector URL is a password. Read SECURITY.md before you install.

### Verify your download
`daisy-handoff.zip.sha256` is attached, and this zip has a signed build provenance attestation:
`gh attestation verify daisy-handoff.zip --repo prophet316/daisy-handoff-release`

Daisy Handoff is an independent project, not affiliated with or endorsed by Anthropic. Claude is a trademark of Anthropic.
