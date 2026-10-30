#!/bin/bash
# Builds {{ASSISTANT}}'s overlay helper (edge glow + {{ASSISTANT}}'s cursor) into ~/{{DOTDIR}}/overlay/DaisyOverlay.app.
# The installer runs it on a Mac with the command line and desktop control on; run it by hand to rebuild.
# A plain AppKit app with no Dock icon (LSUIElement), ad-hoc signed. It needs no macOS permission.
# Usage: worker/overlay/build.sh [output dir]
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:-$HOME/{{DOTDIR}}/overlay}"
APP="$OUT/DaisyOverlay.app"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/DaisyOverlay.app/Contents/MacOS"
# Built for this Mac's own chip (Apple Silicon or Intel); the installer runs this on the Mac that uses it.
xcrun swiftc -O -swift-version 5 -target "$(uname -m)-apple-macos13.0" -framework AppKit -framework QuartzCore \
  "$HERE/DaisyOverlay.swift" -o "$TMP/DaisyOverlay.app/Contents/MacOS/DaisyOverlay"
cat > "$TMP/DaisyOverlay.app/Contents/Info.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>com.daisy.overlay</string>
  <key>CFBundleName</key><string>{{ASSISTANT}} Overlay</string>
  <key>CFBundleExecutable</key><string>DaisyOverlay</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>0.1.0</string>
  <key>LSUIElement</key><true/>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
</dict></plist>
EOF
# The linker already signed it, so codesign says "replacing existing signature": only show what it says when it fails.
SIGN="$(codesign --force --sign - "$TMP/DaisyOverlay.app" 2>&1)" || { echo "$SIGN" >&2; exit 1; }
mkdir -p "$OUT"
rm -rf "$APP.new" && mv "$TMP/DaisyOverlay.app" "$APP.new"
rm -rf "$APP" && mv "$APP.new" "$APP"
echo "built $APP/Contents/MacOS/DaisyOverlay"
