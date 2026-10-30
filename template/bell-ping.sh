#!/bin/bash
# Rings the live {{ASSISTANT}} bell once, the same way the worker does after a job. Proof step: {{OWNER}}'s phone should
# show a Claude push within about 30 seconds. Then shows the bell's own log and the session screen tail.
cd "$(dirname "$0")"
MSG="${1:-Bell test: {{ASSISTANT}} notifications are working. No action needed.}"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST http://127.0.0.1:8790/notify \
  -H "Content-Type: application/json" -H "X-Bell-Key: $(cat .bell-key)" \
  -d "$(python3 -c 'import json,sys; print(json.dumps({"id":"belltest","title":"Bell test","status":"done","line":sys.argv[1]}))' "$MSG")")
echo "bell HTTP: $code (200 = event handed to the Claude session)"
sleep 20
echo "== bell.log"; tail -3 logs/bell.log
echo "== session screen (look for PushNotification and 'Mobile push requested' or 'sent')"
tail -c 6000 logs/bell-screen.log | python3 -c 'import re,sys; t=sys.stdin.buffer.read().decode("utf8","replace"); t=re.sub(r"\x1b\[[0-9;?<>=]*[ -/]*[@-~]|\x1b\][^\x07]*\x07|\x1b[()=>][A-Z0-9]?", " ", t); print(re.sub(r"[ \r]+", " ", t)[-2500:])'
