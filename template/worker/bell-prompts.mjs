// The startup prompts the {{ASSISTANT}} bell answers, and when it stops looking. Used by jarvis-bell.mjs.
// It reads the bell's screen only while the session starts: until Remote Control is up, or 90 seconds, whichever comes
// first. After that, job text on the screen can never trigger a keystroke.
//
// Self-test: node worker/bell-prompts.mjs --selftest

const UP = "\x1b[A";
export const ANSWER_WINDOW_MS = 90_000;
// Prompt text (lowercase, ANSI stripped) -> keystrokes to send, 400 ms apart. Each is answered at most once per start.
export const PROMPTS = [
  // Folder trust is pre-set in ~/.claude.json (projects[jarvis-bell].hasTrustDialogAccepted); its default option is "No, exit", so never auto-answer it.
  // MCP prompt: its options are "Use this MCP server", "Use this and all future...", "Continue without" and the cursor starts on the
  // last one, so a bare Enter declines daisy-bell and nothing listens on the bell port. Go up twice, then Enter.
  // Only when the prompt's own options are on screen too, not just its title.
  { name: "project MCP server", match: [/new mcp server found/, /use this mcp server/], keys: [UP, UP, "\r"] },
  { name: "development channel warning", match: [/i am using this for local development/], keys: ["\r"] },
];
export const RC_UP = /remote control (active|connected)|session url|claude\.ai\/code/;

// What to do with the latest screen text. state: { started, answered: Set, done }. Returns the prompts to answer now.
export function promptsToAnswer(text, state, now = Date.now()) {
  if (state.done) return [];
  if (now - state.started > ANSWER_WINDOW_MS) { state.done = "time"; return []; }
  const out = PROMPTS.filter((p) => !state.answered.has(p.name) && p.match.every((m) => m.test(text)));
  for (const p of out) state.answered.add(p.name);
  if (RC_UP.test(text)) state.done = "rc";
  return out;
}

if (process.argv.includes("--selftest")) {
  let pass = 0, fail = 0;
  const check = (name, ok) => { console.log(`${ok ? "PASS" : "FAIL"}  bell prompts: ${name}`); ok ? pass++ : fail++; };
  const fresh = (t0 = 0) => ({ started: t0, answered: new Set(), done: null });
  const names = (a) => a.map((p) => p.name).join(",");
  let s = fresh();
  check("the development-channel warning is answered at startup", names(promptsToAnswer("warning ... i am using this for local development", s, 5_000)) === "development channel warning");
  check("it is answered only once", promptsToAnswer("i am using this for local development", s, 6_000).length === 0);
  s = fresh();
  check("the MCP prompt's title alone isn't answered", promptsToAnswer("new mcp server found in .mcp.json", s, 1_000).length === 0);
  check("the MCP prompt with its options on screen is answered", names(promptsToAnswer("new mcp server found ... use this mcp server ... continue without", s, 2_000)) === "project MCP server");
  s = fresh();
  promptsToAnswer("remote control active", s, 10_000);
  check("once Remote Control is up, it stops looking", s.done === "rc");
  check("a job summary with the prompt text after that types nothing", promptsToAnswer("needs your ok: new mcp server found use this mcp server i am using this for local development", s, 11_000).length === 0);
  s = fresh();
  check("after 90 seconds it stops looking, even without Remote Control", promptsToAnswer("i am using this for local development", s, ANSWER_WINDOW_MS + 1).length === 0 && s.done === "time");
  console.log(`bell prompts: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
