#!/usr/bin/env python3
# Runs a command inside a real pseudo-terminal (200x50), copies everything it prints to a screen log,
# and forwards our stdin to it. Replaces macOS `script`, which fails under launchd because launchd
# gives it no terminal ("tcgetattr/ioctl: Operation not supported on socket").
# Usage: pty-run.py <screen-log> <command> [args...]
import fcntl, os, pty, select, struct, sys, termios

screen, argv = sys.argv[1], sys.argv[2:]
pid, fd = pty.fork()
if pid == 0:
    fcntl.ioctl(0, termios.TIOCSWINSZ, struct.pack("HHHH", 50, 200, 0, 0))
    os.execvp(argv[0], argv)

out = open(screen, "ab", buffering=0)
stdin = sys.stdin.fileno()
watch = [fd, stdin]
while True:
    ready, _, _ = select.select(watch, [], [])
    if fd in ready:
        try:
            data = os.read(fd, 65536)
        except OSError:
            break
        if not data:
            break
        out.write(data)
    if stdin in ready:
        data = os.read(stdin, 1024)
        if data:
            os.write(fd, data)
        else:
            watch.remove(stdin)
_, status = os.waitpid(pid, 0)
sys.exit(os.waitstatus_to_exitcode(status))
