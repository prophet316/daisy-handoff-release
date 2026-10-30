# Troubleshooting

Start here: in Terminal, in the unzipped release folder, run

```bash
node doctor.mjs
```

After you install, a copy also lives in your install folder (`node ~/Projects/daisy-handoff/doctor.mjs`). The doctor checks your Mac and your install, says what's wrong in plain words, and points to the section below. It only looks; it never changes anything. It also saves a report with your keys, connector URL, emails and user name removed, which you can attach to a bug report after you read it.

Each section below starts with what you see, then what to do.

---

## Before you start

You need all of these. The installer checks Node and Claude Code itself and stops if one is missing; the rest it can't check, so have them ready.

- A Mac on macOS 13 (Ventura) or newer. Check: Apple menu > About This Mac.
- An administrator password for the Mac, or someone who has it. The Node and Command Line Tools installers ask for it.
- A Claude Pro or Max plan. On Team and Enterprise, only an Owner can add a custom connector, and people across the organization can then connect to it. Your connector URL can run commands on your Mac, so don't add it to a shared organization.
- A free Cloudflare account with a verified email address.
- The Claude app on your phone, signed in to the same Claude account.

---

## Node is missing or too old

**You see:** `zsh: command not found: node`, or `STOPPED: Node 20.x is too old`.

1. Go to [nodejs.org](https://nodejs.org) and download the LTS version for macOS.
2. Open the downloaded file and click through the installer. It asks for your Mac's password.
3. Close Terminal completely and open a new window. Terminal only sees new programs in a new window.
4. Check with `node -v`. It must say v22.13 or higher.

---

## Command Line Tools

**You see:** the doctor says Apple's Command Line Tools are missing, or a window pops up asking to install "command line developer tools".

The phone bell uses Python, which comes with Apple's free Command Line Tools. In Terminal run `xcode-select --install`, click **Install**, and wait for it to finish (a few minutes). You don't need the full Xcode app.

---

## claude: command not found

**You see:** Claude Code installed fine, but typing `claude` says `command not found`.

The Claude Code installer puts `claude` in a folder Terminal doesn't look in yet. Run this once, then open a new Terminal window:

```bash
echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc
```

The Nuff Said installer finds Claude Code either way; this only matters when you type `claude` yourself.

---

## Claude Code isn't installed or signed out

**You see:** `STOPPED: Claude Code isn't installed` or `Claude Code is installed but signed out`.

1. Install Claude Code with the command on [Anthropic's setup page](https://code.claude.com/docs/en/setup). The Mac command is `curl -fsSL https://claude.ai/install.sh | bash`.
2. Run `claude` (see the section above if that says command not found).
3. Type `/login` and sign in with your Claude account in the browser. Use your Claude plan, not an API key: phone notifications need a claude.ai sign-in.
4. Type `/exit`, then run `node install.mjs` again.

---

## Cloudflare sign-in or deploy failed

**You see:** `Cloudflare sign-in didn't finish`, `couldn't create the database`, `deploy failed`, or `needs a workers.dev subdomain`.

- **The browser didn't open, or you closed it:** run `node install.mjs` again. Nothing was deployed yet.
- **New account:** open the email from Cloudflare and verify your address, then run the installer again.
- **workers.dev subdomain:** open [dash.cloudflare.com](https://dash.cloudflare.com), go to **Workers & Pages**, and pick a subdomain when it asks. Then run the installer again.
- **Signed in to the wrong Cloudflare account:** run `npx -y wrangler@4.151.3 logout`, then run the installer again and sign in with the right one.
- **Something else:** the last lines of the error come from Cloudflare's own tool. Run `node doctor.mjs` and open an issue with its report.

---

## Install stopped partway

**You see:** the installer stopped after making your install folder, or the doctor says files are missing.

Run these in the unzipped release folder. The first stops anything that started; the second replaces the half-made install and keeps the old folder as a backup.

```bash
node install.mjs --uninstall
node install.mjs --force
```

Give the same answers as before (the same assistant name), so it reuses your Cloudflare connector and database.

---

## Already installed

**You see:** `already exists. Nothing was changed` or `a Nuff Said worker is already running for this user`.

One install per Mac user account works. To replace it, follow the README's **Update** steps. To remove it, follow **Uninstall**.

---

## Claude can't reach the connector

**You see:** in Claude, the connector shows an error, or saying "check updates" does nothing.

- **Paste the whole URL.** It's long. The installer copied it to your clipboard. If you've copied something since, get it again with `pbcopy < ~/Projects/daisy-handoff/.connector-url` and paste it into **Customize > Connectors > + > Add custom connector**.
- **Team or Enterprise plan:** only an Owner can add a custom connector there, and the whole organization can then connect to it. Don't add yours to a shared organization; use a personal Pro or Max account.
- **You rotated the key or updated:** the URL changed. Remove the old connector in Claude and add the new URL.
- **Your phone:** connectors you add on claude.ai or the desktop app show up in the phone app on the same account. Close and reopen the app.
- Run `node doctor.mjs`. It tests your connector from your Mac without showing the URL.

---

## The worker isn't running

**You see:** jobs stay "queued", or the doctor says the worker hasn't checked in.

1. Make sure the Mac is awake and online. Jobs only run while you're logged in to the Mac.
2. Log out of the Mac and back in. The worker starts at login.
3. Still stuck? Look at the end of `logs/worker.log` in your install folder:
   ```bash
   tail -30 ~/Projects/daisy-handoff/logs/worker.log
   ```
   `Not logged in` means Claude Code signed out: run `claude` and `/login`.
4. As a last step, reinstall in place: `node install.mjs --uninstall`, then `node install.mjs --force`.

---

## No phone notifications

Jobs run, but your phone never buzzes when one finishes.

How it works: the installer starts an always-on Claude Code session on your Mac with **Remote Control** turned on. Remote Control is Claude Code's own way to link a session on your computer to the Claude app. When a job finishes, the worker tells that session, and the session sends your phone a push notification through the Claude app. So notifications need all of this:

1. **The Claude app on your phone**, signed in to the same account as Claude Code on your Mac. Open it once after installing.
2. **Notifications allowed** for the Claude app on your phone. On iPhone: Settings > Notifications > Claude. Focus modes can hold them back.
3. **Push turned on in Claude Code.** In Terminal run `claude`, type `/config`, turn on **Push when Claude decides**, then `/exit`. If `/config` says **No mobile registered**, open the Claude app on your phone and try again.
4. **Claude Code trusts the bell folder.** The installer does this for you. If the doctor says it doesn't, run `cd ~/Projects/daisy-handoff/jarvis-bell && claude` (`jarvis-bell` is the Daisy bell's folder; the name is an older internal one), choose **Yes, I trust this folder**, and type `/exit` right away. The bell restarts by itself within a few minutes.
5. **A claude.ai sign-in, not an API key.** Remote Control doesn't work with API keys.

Test it: in your install folder run `./bell-ping.sh`. Your phone should show a notification within about 30 seconds.

You may also see a session named "Daisy bell" (or your assistant's name) in the Claude app. That's the bell. Leave it running.

---

## Desktop control doesn't work

**You see:** "use the computer" jobs fail, or the doctor says CuaDriver is missing or lacks permissions.

Commands and screenshots work without extra setup. Clicking and typing on your desktop needs one more free app:

CuaDriver needs macOS 14 (Sonoma) or newer ([CuaDriver install page](https://cua.ai/docs/how-to-guides/driver/install)). On macOS 13, everything else works; desktop control doesn't.

1. Install **CuaDriver** with the command on its [install page](https://cua.ai/docs/how-to-guides/driver/install): `/bin/bash -c "$(curl -fsSL https://cua.ai/driver/install.sh)"`. It should end up at `/Applications/CuaDriver.app`.
2. Run `cua-driver permissions grant`. macOS asks for Accessibility and for Screen Recording separately, and neither prompt turns anything on by itself.
3. Open **System Settings > Privacy & Security > Accessibility** and turn on CuaDriver (use **+** if it isn't listed). Do the same under **Screen & System Audio Recording**. `cua-driver permissions status` shows whether both are on.

Screenshots ("what's on my screen") need Screen Recording for Node. The first time, macOS asks; click **Allow**.

Don't want desktop control at all? Reinstall with `--no-power-lanes`.

---

## Schedules run at the wrong time

Schedules use the time zone your Mac had when you installed. The doctor shows which one. If you moved, or want another zone, update with your zone named:

```bash
node install.mjs --update --time-zone America/New_York
```

That keeps your connector URL, so there's nothing to redo in Claude.

Use your zone's name from [this list](https://en.wikipedia.org/wiki/List_of_tz_database_time_zones), like `Europe/London` or `Asia/Tokyo`. Installs from version 0.9.0 always used US Central Time; updating fixes that.

---

## Still stuck? Ask for help

1. Run `node doctor.mjs`. It prints where it saved its report.
2. Open the report and read it. Keys, your connector URL, emails and your user name are already removed, but cut anything else you'd rather keep private.
3. Open an issue at [github.com/prophet316/daisy-handoff-release/issues](https://github.com/prophet316/daisy-handoff-release/issues), pick **Install problem** or **Something broke**, and paste the report.

Never paste your connector URL or the files `.connector-url`, `.connector-key`, `.worker-key`, `.bell-key` or `.lead-agent-key`. If one slips out, run `node install.mjs --rotate-keys` (README, "If your URL leaks").
