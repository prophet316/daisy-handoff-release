#!/bin/bash
# Smoke test for the Nuff Said connector ({{ASSISTANT}}).
# Usage: ./test.sh                 (a local dev server at 127.0.0.1:8799 with the key "localtestkey"; the release doesn't set one up)
#        ./test.sh deployed        (your real connector: reads the private URL from .connector-url, never prints it. It queues a
#                                   real job, "Smoke test job", that your worker picks up and runs with Claude Code on this
#                                   computer, on your Claude plan. Cancel it in Claude if you don't want it to run.)
#        ./test.sh gate            (the computer-use safety gate, the power-lanes switch, who-sent-it, time zones, redaction and
#                                   the bell, offline: no desktop, no connector; the bell self-test uses port 18790)
cd "$(dirname "$0")"
if [ "$1" = "gate" ]; then
  NODE="$(command -v node || echo "$HOME/{{DOTDIR}}/node/bin/node")"
  set -o pipefail; rc=0
  echo "1 gate rules (search/Return/URL allowed; posts, sends, uploads, details on other sites blocked; charge held):"
  "$NODE" worker/cua-lane.mjs --selftest | grep -v '^PASS' || rc=1
  echo "2 host lane (browser choice, off-limits apps):"
  "$NODE" worker/host-lane.mjs --selftest | grep -v '^PASS' || rc=1
  echo "3 host lane over MCP with a fake driver (task steps, approve card, one charge, redirects, claude.ai tabs, Claude's side panel, clicks by position in any app, typing after a Claude pane opens, token windows, calls without a pid, unlisted browsers, off-limits apps):"
  "$NODE" test/gate-drive.mjs | grep -v '^PASS' || rc=1
  echo "4 command line and desktop control switch (connector, worker, supervisor; on and off):"
  "$NODE" test/power-lanes.mjs | grep -v '^PASS' || rc=1
  echo "5 who sent it (agents can't approve, publish, run commands or pass as you; schedules and routines keep their sender):"
  "$NODE" test/sender.mjs | grep -v '^PASS' || rc=1
  echo "6 what a job can't change (hold record, lane and hook configs, steering inbox outside the job folder; agent runs don't publish):"
  "$NODE" test/run-state.mjs | grep -v '^PASS' || rc=1
  echo "6b supervisor poll speed (slow when idle; fast after a stop or force kill, or while a job's processes are still alive):"
  "$NODE" test/poll.mjs | grep -v '^PASS' || rc=1
  echo "6c stop and force kill find a job's processes by session, without Python:"
  "$NODE" test/kill-session.mjs | grep -v '^PASS' || rc=1
  echo "7 schedule math in several time zones:"
  "$NODE" test/time-unit.mjs | grep -v '^PASS' || rc=1
  echo "8 command line lane, redaction, bell and bell startup prompt self-tests:"
  "$NODE" worker/shell-lane.mjs --shell-selftest | grep -v '^PASS' || rc=1
  "$NODE" worker/redact.mjs --selftest | grep -v '^PASS' || rc=1
  DAISY_BELL_PORT="${DAISY_BELL_PORT:-18790}" "$NODE" worker/bell.mjs --selftest | grep -v '^PASS' || rc=1
  "$NODE" worker/bell-prompts.mjs --selftest | grep -v '^PASS' || rc=1
  [ $rc = 0 ] && echo "gate: all passed" || echo "gate: FAILED"
  exit $rc
fi
if [ "$1" = "deployed" ]; then B="$(cat .connector-url)"; echo "Note: step 4 queues a real job on your connector; your worker runs it with Claude Code on this computer."; else B="http://127.0.0.1:8799/localtestkey/mcp"; fi
BAD="${B%/*/mcp}/wrongkey/mcp"
post() { curl -s -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -X POST "$B" -d "$1"; echo; }
code() { curl -s -o /dev/null -w "%{http_code}" -H "Content-Type: application/json" -X POST "$1" -d "$2"; echo; }

echo "1 initialize:"; post '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke-test","version":"1"}}}'
echo "2 initialized notification (expect 202):"; code "$B" '{"jsonrpc":"2.0","method":"notifications/initialized"}'
echo "3 tools/list names:"; post '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | node -e 'let s="";process.stdin.on("data",(d)=>s+=d).on("end",()=>console.log(JSON.parse(s).result.tools.map((t)=>t.name)))'
echo "4 add_job:"; post '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"add_job","arguments":{"title":"Smoke test job","details":"Proving the connector stores jobs"}}}'
echo "5 list_jobs:"; post '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"list_jobs","arguments":{"limit":3}}}'
echo "6 add_job missing title (expect isError true):"; post '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"add_job","arguments":{}}}'
echo "7 wrong key (expect 404):"; code "$BAD" '{}'
echo "8 GET (expect 405):"; curl -s -o /dev/null -w "%{http_code}\n" "$B"
echo "9 unknown method (expect -32601):"; post '{"jsonrpc":"2.0","id":6,"method":"bogus/method"}'
echo "10 bad JSON (expect 400):"; code "$B" 'not json'
