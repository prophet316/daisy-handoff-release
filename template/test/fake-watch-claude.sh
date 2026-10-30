#!/bin/bash
# Stand-in for Claude Code in watch-test.sh (job 94c3a255). Plays one scenario, named in the job's details as SCENARIO=<name>,
# and reports every step through the real job hook (worker/job-hook.mjs), exactly as Claude Code's hooks would:
#   long      novel steps for over two simulated hours, then done        (check-ins, no recovery)
#   frozen    a few steps, then a command that hangs and ignores SIGTERM  (killed and resumed; the resumed run finishes)
#   spin      the same command over and over, no new files               (caught after two no-progress check-ins, resumed)
#   needsjon  hangs in "gh auth login"                                   (stopped, {{OWNER}} asked once)
#   cap       hangs every time, resumed or not                           (blocked after 3 recoveries)
# On --resume it continues the scenario's second act. Its own bookkeeping is in dot files, so it never counts as progress.
[ "$1" = auth ] && { echo '{"loggedIn":true}'; exit 0; } # the worker's health check
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
D="$DAISY_JOB_DIR"
PROMPT="" RESUME=""
while [ $# -gt 0 ]; do case "$1" in -p) PROMPT="$2"; shift;; --resume) RESUME="$2"; shift;; esac; shift; done
S=$(printf '%s' "$PROMPT" | grep -oE 'SCENARIO=[a-z]+' | head -1 | cut -d= -f2)
[ -n "$S" ] && echo "$S" > "$D/.fake-scenario"
S=$(cat "$D/.fake-scenario" 2>/dev/null)
SID="${RESUME:-fake-$(openssl rand -hex 4)}"
N=$(( $(wc -l < "$D/.fake-runs.log" 2>/dev/null || echo 0) + 1 ))
echo "$(date -u +%FT%TZ) run $N scenario=$S resume=${RESUME:-none} sid=$SID prompt=$(printf '%s' "$PROMPT" | head -c 90 | tr '\n' ' ')" >> "$D/.fake-runs.log"
printf '%s' "$PROMPT" > "$D/.fake-prompt-$N"
trap '' TERM
hook() { # event tool json-input
  printf '{"hook_event_name":"%s","session_id":"%s","tool_name":"%s","tool_input":%s}' "$1" "$SID" "$2" "$3" | node "$ROOT/worker/job-hook.mjs" > /dev/null
}
step() { hook PreToolUse "$1" "$2"; hook PostToolUse "$1" "$2"; }
finish() { printf '{"type":"result","is_error":false,"result":"Fake %s finished on run %s. STATUS: DONE","session_id":"%s"}\n' "$S" "$N" "$SID"; exit 0; }
hang() { # a command that never returns and ignores SIGTERM, in its own process group, like a stuck Bash tool command
  hook PreToolUse Bash "{\"command\":\"$1\",\"description\":\"$1\"}"
  /usr/bin/perl -e 'setpgrp(0,0); $SIG{TERM}="IGNORE"; open(F,">","$ENV{DAISY_JOB_DIR}/.fake-tool.pid"); print F $$; close F; sleep 1 while 1' &
  while true; do sleep 1; done
}
if [ -n "$RESUME" ] && [ "$S" != cap ]; then
  step Read "{\"file_path\":\"$D/notes.md\"}"; step Write "{\"file_path\":\"$D/after-recovery.md\",\"content\":\"resumed $N\"}"
  echo "resumed on run $N" > "$D/after-recovery.md"; finish
fi
case "$S" in
  long) # digits are folded when judging repetition, so each step gets its own letters
    L=(a b c d e f g h i j k l m n o p q r s t u v w x y z)
    for i in $(seq 1 65); do
      w="${L[$((i % 26))]}${L[$((i / 26))]}"
      case $((i % 4)) in
        0) step WebSearch "{\"query\":\"topic $w\"}";;
        1) step Read "{\"file_path\":\"/tmp/source-$w.md\"}";;
        2) step WebFetch "{\"url\":\"https://example.org/page-$w\"}";;
        3) step Write "{\"file_path\":\"$D/draft.md\",\"content\":\"section $w\"}"; echo "section $w" >> "$D/draft.md";;
      esac
      sleep 2
    done
    finish;;
  frozen) step Read '{"file_path":"/tmp/a.md"}'; step Grep '{"pattern":"needle"}'; hang "curl https://slow.example/hang";;
  spin) while true; do step Bash '{"command":"npm test","description":"npm test"}'; sleep 2; done;;
  needsjon)
    mkdir -p "$D/.bin"; printf '#!/bin/bash\n/bin/sleep 100000\n' > "$D/.bin/gh"; chmod +x "$D/.bin/gh"
    step Read '{"file_path":"/tmp/repo/README.md"}'
    hook PreToolUse Bash '{"command":"gh auth login --web","description":"gh auth login --web"}'
    /usr/bin/perl -e 'setpgrp(0,0); exec @ARGV' "$D/.bin/gh" auth login --web &
    while true; do sleep 1; done;;
  cap) step Read "{\"file_path\":\"/tmp/c-$N.md\"}"; hang "make wait-forever";;
  *) finish;;
esac
