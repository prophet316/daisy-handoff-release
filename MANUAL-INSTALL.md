# Manual install (Mac)

Use this only if `node install.mjs` keeps stopping at the Cloudflare step and [TROUBLESHOOTING.md](TROUBLESHOOTING.md) didn't help. It does the same things as the installer, one step at a time, so you can see exactly where it fails.

Every command runs in Terminal. Copy one block at a time and check that it worked before the next.

These steps assume your assistant is called **Daisy**, so everything is named `daisy-handoff`. If you pick another name (say Max), use `max-handoff` everywhere below. The names end in `-handoff`, and they stay that way so updates keep finding your install.

## 0. Check your Mac

In the unzipped release folder:

```bash
node doctor.mjs --offline
```

Fix anything it marks FAIL under "This computer" and "Claude Code" first. Problems under "Your install" are expected now.

## 1. Build your copy (nothing goes online yet)

Still in the unzipped release folder:

```bash
node install.mjs --manual
```

Answer the five questions. Phone notifications stay off unless you type yes; the question says why. This writes your install folder `~/Projects/daisy-handoff`, makes your three private keys, and writes the background services to `~/Library/LaunchAgents`. It deploys nothing and doesn't start them now, but macOS loads them at your next login. If you stop partway through this guide, run `node install.mjs --uninstall` in the release folder so they don't start at the next login with an unfinished install; it moves them to `~/.handoff-uninstalled`. The time zone line shows the zone your schedules will use; to pick another, add `--time-zone America/New_York` (or your zone) to the command.

It ends with "DRY RUN COMPLETE" and a "Last step is yours" list. Leave that list for step 9: the URL it mentions is only a placeholder until step 5.

From now on, work in the install folder:

```bash
cd ~/Projects/daisy-handoff
```

## 2. Sign in to Cloudflare

```bash
npx -y wrangler@4.151.3 login
```

Your browser opens. Sign in (a free account works) and click **Allow**. Check it worked:

```bash
npx -y wrangler@4.151.3 whoami
```

## 3. Make your database

```bash
npx -y wrangler@4.151.3 d1 create daisy-handoff-jobs
```

If it asks whether to add the database to your configuration, answer no. It prints a `database_id` (a long ID with dashes). Open `wrangler.toml` in TextEdit (`open -e wrangler.toml`), find `database_id = "set-by-deploy"`, and replace `set-by-deploy` with your ID, keeping the quotes. Save.

Then create the job table:

```bash
npx -y wrangler@4.151.3 d1 execute daisy-handoff-jobs --remote --file schema.sql -y
```

## 4. Put your connector on Cloudflare

```bash
npx -y wrangler@4.151.3 deploy
```

At the end it prints your connector's address, like `https://daisy-handoff.your-subdomain.workers.dev`, with your own subdomain in the middle. If it asks you to pick a workers.dev subdomain, do that in the Cloudflare dashboard (Workers & Pages) and run it again.

Store your two keys on Cloudflare. They go in from the files, so they never show on screen:

```bash
npx -y wrangler@4.151.3 secret put CONNECTOR_KEY < .connector-key
npx -y wrangler@4.151.3 secret put WORKER_KEY < .worker-key
```

## 5. Point your Mac at it

Put the address from step 4 here (no slash at the end), then run the block:

```bash
BASE="https://daisy-handoff.your-subdomain.workers.dev"
node -e 'const f="worker/config.json",c=JSON.parse(require("fs").readFileSync(f));c.base=process.argv[1];require("fs").writeFileSync(f,JSON.stringify(c,null,2)+"\n")' "$BASE"
printf '%s/%s/mcp' "$BASE" "$(cat .connector-key)" > .connector-url
chmod 600 .connector-url
```

`.connector-url` is your private connector URL. Treat it like a password.

If you left the command line and desktop control on, build the blue glow and Daisy cursor (named after your assistant) for desktop control. It needs Apple's Command Line Tools and takes a few seconds:

```bash
bash worker/overlay/build.sh
```

If it fails, desktop control still works, with CuaDriver's own cursor and no glow.

## 6. Let Claude Code trust the bell folder

Skip this step if you left phone notifications off.

The phone bell ("Daisy bell") is a Claude Code session that runs in the bell folder. The folder is named `jarvis-bell`, an older internal name that is kept so updates don't leave a second bell behind. Claude Code asks once whether to trust a new folder:

```bash
cd ~/Projects/daisy-handoff/jarvis-bell && claude
```

Choose **Yes, I trust this folder**, then type `/exit` right away. Then go back: `cd ~/Projects/daisy-handoff`.

## 7. Start the worker

```bash
for f in ~/Library/LaunchAgents/com.daisy.*.plist; do launchctl bootstrap gui/$(id -u) "$f"; done
```

They also start by themselves every time you log in.

## 8. Check it

```bash
node doctor.mjs
```

Everything should say ok, apart from the phone notification lines until you finish step 9.

## 9. Connect Claude and your phone

1. Copy your URL: `pbcopy < .connector-url`
2. In Claude (claude.ai or the desktop app): **Customize > Connectors**, click **+ Add**, then **Add custom connector**. This is for personal Pro, Max and Ultra accounts: on Team and Enterprise an admin (an Owner, or on Enterprise someone whose role can manage connectors) adds one for the organization, and people across it can then connect to it, so don't add yours there. Name it "Daisy Handoff", paste, and click **Continue**. Claude shows the authentication settings it detected; click **Continue** again. Under **Authentication** choose **No sign in**, leave **Request headers** empty, and click **Add** ([Get started with custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)).
3. If you turned on phone notifications: on your phone, sign in to the Claude app with the same account and allow notifications.
4. If you turned them on: in Terminal run `claude`, type `/config`, turn on **Push when Claude decides**, then `/exit`.
5. Open the Claude app. If **Daisy Handoff** isn't on for the chat yet, tap **+**, choose **Connectors** and turn it on (Anthropic says to turn a connector on for each conversation: [Use connectors](https://support.claude.com/en/articles/11176164-use-connectors-to-extend-claude-s-capabilities)). Then start voice and say: **"Check updates with Daisy."** You're still talking to Claude; the name tells Claude to use your connector.

To remove a manual install, follow the README's **Uninstall** steps. They're the same.
