#!/bin/bash
# Deploys {{OWNER}}'s Nuff Said connector ({{ASSISTANT}}) to Cloudflare: its own Worker ({{SLUG}}), its own D1 database and its own secrets.
# Run it from the rendered install folder. Never prints a key or the connector URL.
set -uo pipefail
cd "$(dirname "$0")"
[ -x "$HOME/{{DOTDIR}}/node/bin/node" ] && export PATH="$HOME/{{DOTDIR}}/node/bin:$PATH"   # this install's own pinned Node, if present
grep -q '^name = "{{SLUG}}"$' wrangler.toml || { echo "FAILED: wrangler.toml is not for {{SLUG}}"; exit 1; }
W="npx -y wrangler@4.151.3"
DBNAME="{{SLUG}}-jobs"

find_db() { $W d1 list --json 2>/dev/null | python3 -c "import sys,json; print(next((d['uuid'] for d in json.load(sys.stdin) if d['name']=='$DBNAME'),''))"; }

echo "== 1/6 Database"
DBID="$(find_db)"
if [ -z "$DBID" ]; then $W d1 create "$DBNAME" >/dev/null 2>&1 || true; DBID="$(find_db)"; fi
[ -z "$DBID" ] && { echo "FAILED: could not create or find the D1 database"; exit 1; }
cp wrangler.toml "wrangler.toml.bak.$(date +%Y%m%d-%H%M%S)"
python3 - "$DBID" <<'PY'
import re,sys
p="wrangler.toml"; s=open(p).read()
s=re.sub(r'database_id = "[^"]*"( #.*)?', f'database_id = "{sys.argv[1]}"', s)
open(p,"w").write(s)
PY
echo "database ready"

echo "== 2/6 Table"
$W d1 execute "$DBNAME" --remote --file schema.sql -y 2>&1 | grep -E "success|rror" | head -3

echo "== 3/6 Deploy"
OUT="$($W deploy 2>&1)"; echo "$OUT" | grep -E "Uploaded|Deployed|workers.dev|rror" | head -6
URL="$(echo "$OUT" | grep -oE 'https://[a-z0-9.-]+\.workers\.dev' | head -1)"
[ -z "$URL" ] && { echo "FAILED: no workers.dev URL in deploy output"; exit 1; }

echo "== 4/6 Private keys (made here, never copied from another install)"
if [ ! -s .connector-key ]; then (umask 077; openssl rand -hex 32 | tr -d '\n' > .connector-key); fi
if [ ! -s .worker-key ]; then (umask 077; openssl rand -hex 32 | tr -d '\n' > .worker-key); fi
$W secret put CONNECTOR_KEY < .connector-key 2>&1 | grep -E "Success|rror" | head -2
$W secret put WORKER_KEY < .worker-key 2>&1 | grep -E "Success|rror" | head -2
(umask 077; printf '%s/%s/mcp' "$URL" "$(cat .connector-key)" > .connector-url)

echo "== 5/6 Live smoke test (waiting for the secret to take effect)"
sleep 8
./test.sh deployed

echo "== 6/6 Clipboard"
pbcopy < .connector-url && echo "connector URL copied to clipboard (not shown here)"
echo "DEPLOY COMPLETE"
