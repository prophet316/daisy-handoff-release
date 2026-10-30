#!/bin/bash
# Stand-in for Claude Code in the control-lane test: a job that ignores SIGTERM and hangs forever. Like Claude Code's
# Bash tool, it starts a child in its own process group (which also ignores SIGTERM), so killing only this process
# or only its group would leave the child running.
[ "$1" = auth ] && { echo '{"loggedIn":true}'; exit 0; } # the worker's health check
trap '' TERM
echo $$ > "$DAISY_JOB_DIR/fake-claude.pid"
/usr/bin/perl -e 'setpgrp(0,0); $SIG{TERM}="IGNORE"; open(F,">","$ENV{DAISY_JOB_DIR}/fake-tool.pid"); print F $$; close F; sleep 1 while 1' &
while true; do sleep 1; done
