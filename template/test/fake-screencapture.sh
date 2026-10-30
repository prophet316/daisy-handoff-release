#!/bin/bash
# Stand-in for /usr/sbin/screencapture in local tests: acts like a Mac with one display.
# Copies $FAKE_SCREEN_IMAGE to the first file named; extra file names (more displays) are left alone, like the real tool.
while [ $# -gt 0 ]; do
  case "$1" in -t) shift 2;; -*) shift;; *) cp "$FAKE_SCREEN_IMAGE" "$1"; exit 0;; esac
done
echo "no file given" >&2; exit 1
