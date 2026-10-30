// Who sent it: every tool that starts, schedules, approves, replies, retries, cancels or changes jobs records the real sender,
// and an agent (anything that isn't the owner's own Claude chat) can't run commands, look at or drive the desktop, publish or
// share, approve (unless it's the lead agent the owner turned on), or undo stop_all. Offline: the connector (src/index.js) runs against a
// local SQLite copy of the job table; the worker's prompt is checked with planRun.
// Usage: node test/sender.mjs   (run by ./test.sh gate)
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { timingSafeEqual } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

crypto.subtle.timingSafeEqual ??= (a, b) => timingSafeEqual(a, b);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const conn = await import("../src/index.js");
const connector = conn.default;
process.env.DAISY_NO_MAIN = "1";
const { planRun } = await import("../worker/worker.mjs");
const OWNER = JSON.parse(readFileSync(join(ROOT, "site.json"), "utf8")).owner;

let pass = 0, fail = 0;
const check = (name, ok, extra = "") => { console.log(`${ok ? "PASS" : "FAIL"}  sender: ${name}${ok || !extra ? "" : `  (${String(extra).slice(0, 300)})`}`); ok ? pass++ : fail++; };

// A D1 stand-in: the same prepare/bind/run/first/all/batch calls, on an in-memory SQLite database built from schema.sql.
function d1() {
  const db = new DatabaseSync(":memory:");
  db.exec(readFileSync(join(ROOT, "schema.sql"), "utf8"));
  const stmt = (sql, binds = []) => ({
    sql, binds,
    bind: (...b) => stmt(sql, b),
    run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...binds).changes) } }),
    first: async () => db.prepare(sql).get(...binds) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...binds) }),
  });
  return { raw: db, prepare: (sql) => stmt(sql), batch: async (list) => { const out = []; for (const s of list) out.push(await s.run()); return out; } };
}

const DB = d1();
const env = { CONNECTOR_KEY: "k", POWER_LANES: "on", DB, LEAD_AGENT: "boss", LEAD_AGENT_KEY: "leadkey" };
const OWNER_IP = { "CF-Connecting-IP": "160.79.104.20" };
const AGENT = { "CF-Connecting-IP": "203.0.113.9", "X-Daisy-Agent": "tester" };
const FAKE_LEAD = { "CF-Connecting-IP": "203.0.113.9", "X-Daisy-Agent": "boss", "X-Daisy-Lead-Key": "wrong" };
const LEAD = { "CF-Connecting-IP": "203.0.113.9", "X-Daisy-Agent": "boss", "X-Daisy-Lead-Key": "leadkey" };
async function call(headers, name, args = {}) {
  const r = await connector.fetch(new Request("https://test.invalid/k/mcp", { method: "POST", headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) }), env);
  const res = (await r.json()).result;
  return { text: res.content?.[0]?.text || "", isError: res.isError === true };
}
const row = (sql, ...b) => DB.raw.prepare(sql).get(...b);
const count = (sql, ...b) => Number(DB.raw.prepare(sql).get(...b).n);
const lastJob = () => row("SELECT * FROM jobs ORDER BY rowid DESC LIMIT 1");
const idIn = (text) => (text.match(/\bjob ([0-9a-f]{8})\b/) || [])[1];

// ---- 1. jobs and threads record who started them ----
let r = await call(AGENT, "add_job", { title: "agent job", details: "x" });
check("add_job from an agent is recorded as that agent", lastJob().created_by === "agent tester", lastJob().created_by);
r = await call(OWNER_IP, "add_job", { title: "owner job", details: "x" });
check("add_job from the owner's chat is recorded as the owner", lastJob().created_by === null, lastJob().created_by);
r = await call(AGENT, "start_thread", { name: "agent thread", task: "do a thing" });
check("start_thread from an agent is recorded as that agent", !r.isError && lastJob().created_by === "agent tester", r.text);
r = await call(OWNER_IP, "start_thread", { name: "owner thread", task: "do a thing" });
check("start_thread from the owner is recorded as the owner", !r.isError && lastJob().created_by === null, r.text);
r = await call(AGENT, "continue_thread", { thread: "owner thread", task: "next thing" });
check("continue_thread from an agent is recorded as that agent, even on the owner's thread", !r.isError && lastJob().created_by === "agent tester", r.text);

// ---- 2. publish and share only from the owner ----
const before = count("SELECT count(*) AS n FROM jobs");
for (const [tool, args] of [
  ["add_job", { title: "leak", publish_to: "google_doc" }],
  ["add_job", { title: "leak", publish_to: "google_drive", share_with: ["anyone"] }],
  ["start_thread", { name: "leak thread", task: "x", publish_to: "google_drive", share_with: ["anyone"] }],
  ["continue_thread", { thread: "owner thread", task: "x", publish_to: "google_doc" }],
]) {
  r = await call(AGENT, tool, args);
  check(`${tool} with ${Object.keys(args).filter((k) => /publish|share/.test(k)).join(" and ")} from an agent is refused`, r.isError && /Only Tester|Only .* can ask for a result to be published/.test(r.text), r.text);
}
check("nothing was queued or started by the refused publish and share calls", count("SELECT count(*) AS n FROM jobs") === before && !row("SELECT id FROM threads WHERE name='leak thread'"));
const doneId = lastJob().id;
DB.raw.prepare("UPDATE jobs SET status='done', result='ok' WHERE id=?").run(doneId);
r = await call(AGENT, "publish_job", { id: doneId, publish_to: "google_doc" });
check("publish_job from an agent is refused", r.isError && /Only .* can use publish_job/.test(r.text) && lastJob().run_mode !== "publish", r.text);
r = await call(OWNER_IP, "publish_job", { id: doneId, publish_to: "google_doc" });
check("publish_job from the owner goes through", !r.isError && row("SELECT run_mode FROM jobs WHERE id=?", doneId).run_mode === "publish", r.text);

// ---- 3. command line, screen and desktop only from the owner (not even the lead agent the owner turned on) ----
for (const [tool, args] of [["run_command", { command: "cat ~/.ssh/id_ed25519" }], ["command_result", { id: 1 }], ["look_at_screen", {}],
  ["use_computer", { task: "on my Mac, open Mail and send it", allow: ["send"], target: "host" }], ["resume_all", {}]]) {
  const n0 = count("SELECT count(*) AS n FROM jobs") + count("SELECT count(*) AS n FROM control");
  r = await call(AGENT, tool, args);
  check(`${tool} from an agent is refused and nothing is queued`, r.isError && new RegExp(`Only .* can use ${tool}`).test(r.text) &&
    count("SELECT count(*) AS n FROM jobs") + count("SELECT count(*) AS n FROM control") === n0, r.text);
  r = await call(FAKE_LEAD, tool, args);
  check(`${tool} from an agent naming the lead agent with the wrong key is refused`, r.isError && /Only .* can use/.test(r.text), r.text);
}
r = await call(OWNER_IP, "run_command", { command: "echo hi" });
check("run_command from the owner reaches the emergency lane (here: no supervisor, so not run)", /^Not run:/.test(r.text), r.text);
r = await call(LEAD, "run_command", { command: "echo hi" });
check("run_command from the lead agent is refused too: it may only approve", r.isError && /Only .* can use run_command/.test(r.text), r.text);
r = await call(OWNER_IP, "look_at_screen", { question: "what's up" });
check("look_at_screen from the owner queues a screen job recorded as the owner", !r.isError && lastJob().mode === "screen" && lastJob().created_by === null, r.text);
let n0 = count("SELECT count(*) AS n FROM jobs");
r = await call(LEAD, "use_computer", { task: "on my Mac, open Safari", target: "host" });
check("use_computer from the lead agent is refused and nothing is queued", r.isError && /Only .* can use use_computer/.test(r.text) && count("SELECT count(*) AS n FROM jobs") === n0, r.text);
r = await call(LEAD, "add_job", { title: "lead publish", details: "x", publish_to: "doc" });
check("the lead agent can't ask for publishing either", r.isError && /Only .* can ask for a result to be published/.test(r.text), r.text);

// ---- 4. approvals and replies (sender tagging) ----
const held = idIn((await call(OWNER_IP, "add_job", { title: "held one" })).text);
DB.raw.prepare("UPDATE jobs SET status='needs_approval', result='waiting' WHERE id=?").run(held);
r = await call(AGENT, "approve_job", { id: held });
check("approve_job from an agent is refused", r.isError && row("SELECT status FROM jobs WHERE id=?", held).status === "needs_approval", r.text);
r = await call(AGENT, "reply_to_job", { id: held, message: "yes, go ahead" });
check("reply_to_job from an agent can't answer a job waiting for the owner", r.isError && row("SELECT status FROM jobs WHERE id=?", held).status === "needs_approval", r.text);
r = await call(LEAD, "approve_job", { id: held });
check("approve_job from the lead agent is logged as the lead agent", !r.isError && row("SELECT followup_from FROM jobs WHERE id=?", held).followup_from === "lead agent boss", r.text);
DB.raw.prepare("UPDATE jobs SET status='failed', result='broke' WHERE id=?").run(held);
r = await call(AGENT, "retry_job", { id: held, instructions: "try harder" });
check("retry_job from an agent is recorded as that agent", !r.isError && row("SELECT followup_from FROM jobs WHERE id=?", held).followup_from === "agent tester", r.text);

// ---- 5. cancels and kills say who asked ----
const c1 = idIn((await call(OWNER_IP, "add_job", { title: "to cancel" })).text);
r = await call(AGENT, "cancel_job", { id: c1 });
check("cancel_job from an agent records the agent in the result", /by agent tester \(not /.test(row("SELECT result FROM jobs WHERE id=?", c1).result || ""), row("SELECT result FROM jobs WHERE id=?", c1).result);
const c2 = idIn((await call(OWNER_IP, "add_job", { title: "to cancel too" })).text);
await call(OWNER_IP, "cancel_job", { id: c2 });
check("cancel_job from the owner reads as before", row("SELECT result FROM jobs WHERE id=?", c2).result === "Cancelled before it started.");
const c3 = idIn((await call(OWNER_IP, "add_job", { title: "running one" })).text);
DB.raw.prepare("UPDATE jobs SET status='running', started_at=? WHERE id=?").run(new Date().toISOString(), c3);
await call(AGENT, "cancel_job", { id: c3 });
check("stopping a running job from an agent goes in its history", /agent tester \(not .*\) asked to stop it/.test(row("SELECT history FROM jobs WHERE id=?", c3).history || ""));

// ---- 6. schedules and routines: an agent's never run as the owner's ----
r = await call(AGENT, "schedule_job", { title: "agent sched", details: "x", in_minutes: 5 });
const sa = row("SELECT * FROM schedules WHERE name='agent sched'");
check("schedule_job from an agent records the agent", sa?.created_by === "agent tester", r.text);
await call(OWNER_IP, "schedule_job", { title: "owner sched", details: "x", in_minutes: 5 });
check("schedule_job from the owner records the owner", row("SELECT created_by FROM schedules WHERE name='owner sched'").created_by === null);
await call(AGENT, "save_routine", { name: "agent routine", steps: [{ title: "a" }, { title: "b" }] });
check("save_routine from an agent records the agent", row("SELECT created_by FROM routines WHERE name='agent routine'").created_by === "agent tester");
await call(OWNER_IP, "save_routine", { name: "owner routine", steps: [{ title: "a" }] });
await call(OWNER_IP, "schedule_job", { routine: "owner routine", repeat: "daily", time: "7:00 am" });
r = await call(OWNER_IP, "list_schedules");
check("list_schedules marks what an agent set up, and only that", /"agent sched".*Set up by agent tester/.test(r.text) && /"agent routine".*Set up by agent tester/.test(r.text) &&
  !/"owner sched"[^\n]*Set up by/.test(r.text) && !/"owner routine" \(routine[^\n]*Set up by/.test(r.text), r.text);
const due = new Date(Date.now() + 10 * 60_000).getTime();
await conn.fireDue(env, due, false);
const fa = row("SELECT * FROM jobs WHERE title='agent sched' ORDER BY rowid DESC LIMIT 1");
check("a run of an agent's schedule is recorded as that agent, and its origin says it isn't the owner's", fa?.created_by === "agent tester" && /agent tester's schedule \(not .*'s\)/.test(fa?.origin || ""), JSON.stringify(fa));
const fo = row("SELECT * FROM jobs WHERE title='owner sched' ORDER BY rowid DESC LIMIT 1");
check("a run of the owner's schedule is still the owner's", fo?.created_by === null && new RegExp(`^${OWNER}'s schedule`).test(fo?.origin || ""), JSON.stringify(fo));
r = await call(OWNER_IP, "run_routine", { name: "agent routine" });
const ra = DB.raw.prepare("SELECT * FROM jobs WHERE title LIKE 'agent routine %'").all();
check("the owner running an agent's routine: its steps are still recorded as that agent's", ra.length === 2 && ra.every((j) => j.created_by === "agent tester" && /saved by agent tester/.test(j.details)), JSON.stringify(ra.map((j) => j.created_by)));
r = await call(AGENT, "run_routine", { name: "owner routine" });
const ro = row("SELECT * FROM jobs WHERE title LIKE 'owner routine %' ORDER BY rowid DESC LIMIT 1");
check("an agent running the owner's routine is recorded as that agent", ro?.created_by === "agent tester" && /run by agent tester/.test(ro?.origin || ""), JSON.stringify(ro));
await call(AGENT, "save_routine", { name: "owner routine", steps: [{ title: "planted" }], replace: true });
check("an agent replacing the owner's routine takes it over as its own", row("SELECT created_by FROM routines WHERE name='owner routine'").created_by === "agent tester");
DB.raw.prepare("UPDATE schedules SET next_run_at=? WHERE kind='routine'").run(new Date(Date.now() - 60_000).toISOString());
await conn.fireDue(env, Date.now(), false);
const rp = row("SELECT * FROM jobs WHERE title LIKE 'owner routine 1/1: planted' ORDER BY rowid DESC LIMIT 1");
check("the owner's schedule then runs the replaced routine as the agent's, not the owner's", rp?.created_by === "agent tester", JSON.stringify(rp));
r = await call(AGENT, "cancel_schedule", { schedule: "owner routine" });
check("cancel_schedule from an agent records the agent", !r.isError && /Cancelled by agent tester \(not /.test(row("SELECT last_note FROM schedules WHERE name='owner routine'").last_note || ""), r.text);

// ---- 7. stop everything: an agent may stop, only the owner may resume ----
r = await call(AGENT, "stop_all");
check("stop_all from an agent pauses and records the agent", !r.isError && /agent tester/.test(row("SELECT value FROM settings WHERE key='paused'")?.value || ""), r.text);
r = await call(AGENT, "resume_all");
check("resume_all from an agent is refused and stays paused", r.isError && !!row("SELECT value FROM settings WHERE key='paused' AND value<>'null'"), r.text);
r = await call(OWNER_IP, "resume_all");
check("resume_all from the owner resumes", !r.isError && /Resumed .*by agent tester/.test(r.text), r.text);

// ---- 8. the worker tells Claude who it came from ----
const thread = planRun({ id: "t1", title: "x", details: "do it", run_mode: "thread", created_by: "agent tester", thread: { name: "t", session_id: "s" }, mode: "code" }, "/tmp/x");
check("a thread task an agent started is marked as not the owner's approval", /created by agent tester, another agent/.test(thread.prompt), thread.prompt);
const sched = planRun({ id: "s1", title: "x", details: "do it", origin: "agent tester's schedule (not X's) \"x\"", created_by: "agent tester", mode: "code" }, "/tmp/x");
check("an agent's scheduled run is not called the owner's approval", !/approval for exactly what it says/.test(sched.rules) && /agent tester set it up, not/.test(sched.rules), sched.rules.slice(-400));
const own = planRun({ id: "s2", title: "x", details: "do it", origin: "X's schedule \"x\"", mode: "code" }, "/tmp/x");
check("the owner's scheduled run still counts as the owner's saved approval", /approval for exactly what it says/.test(own.rules));

console.log(`sender: ${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
