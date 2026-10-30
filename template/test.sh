#!/bin/bash
# Smoke test for the Nuff Said connector ({{ASSISTANT}}).
# Usage: ./test.sh                 (local dev server)
#        ./test.sh deployed        (reads the private URL from .connector-url, never prints it)
#        ./test.sh gate            (the computer-use safety gate, the power-lanes switch and who-sent-it, offline: no desktop, no connector)
cd "$(dirname "$0")"
if [ "$1" = "gate" ]; then
  NODE="$(command -v node || echo "$HOME/{{DOTDIR}}/node/bin/node")"
  set -o pipefail; rc=0
  echo "1 gate rules (search/Return/URL allowed; posts, sends, uploads, details on other sites blocked; charge held):"
  "$NODE" worker/cua-lane.mjs --selftest | grep -v '^PASS' || rc=1
  echo "2 host lane (browser choice, off-limits apps):"
  "$NODE" worker/host-lane.mjs --selftest | grep -v '^PASS' || rc=1
  echo "3 host lane over MCP with a fake driver (task steps, approve card, one charge, redirects):"
  "$NODE" test/gate-drive.mjs | grep -v '^PASS' || rc=1
  echo "4 command line and desktop control switch (connector, worker, supervisor; on and off):"
  "$NODE" test/power-lanes.mjs | grep -v '^PASS' || rc=1
  echo "5 who sent it (agents can't approve, publish, run commands or pass as you; schedules and routines keep their sender):"
  "$NODE" test/sender.mjs | grep -v '^PASS' || rc=1
  echo "6 what a job can't change (hold record, lane and hook configs, steering inbox outside the job folder; agent runs don't publish):"
  "$NODE" test/run-state.mjs | grep -v '^PASS' || rc=1
  [ $rc = 0 ] && echo "gate: all passed" || echo "gate: FAILED"
  exit $rc
fi
if [ "$1" = "deployed" ]; then B="$(cat .connector-url)"; else B="http://127.0.0.1:8799/localtestkey/mcp"; fi
BAD="${B%/*/mcp}/wrongkey/mcp"
post() { curl -s -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -X POST "$B" -d "$1"; echo; }
code() { curl -s -o /dev/null -w "%{http_code}" -H "Content-Type: application/json" -X POST "$1" -d "$2"; echo; }

echo "1 initialize:"; post '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke-test","version":"1"}}}'
echo "2 initialized notification (expect 202):"; code "$B" '{"jsonrpc":"2.0","method":"notifications/initialized"}'
echo "3 tools/list names:"; post '{"jsonrpc":"2.0","id":2,"method":"tools/list"}' | python3 -c 'import sys,json; print([t["name"] for t in json.load(sys.stdin)["result"]["tools"]])'
echo "4 add_job:"; post '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"add_job","arguments":{"title":"Smoke test job","details":"Proving the connector stores jobs"}}}'
echo "5 list_jobs:"; post '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"list_jobs","arguments":{"limit":3}}}'
echo "6 add_job missing title (expect isError true):"; post '{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"add_job","arguments":{}}}'
echo "7 wrong key (expect 404):"; code "$BAD" '{}'
echo "8 GET (expect 405):"; curl -s -o /dev/null -w "%{http_code}\n" "$B"
echo "9 unknown method (expect -32601):"; post '{"jsonrpc":"2.0","id":6,"method":"bogus/method"}'
echo "10 bad JSON (expect 400):"; code "$B" 'not json'
