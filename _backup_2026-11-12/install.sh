#!/bin/bash
# PhysCalc installer for macOS.
#   • copies the app to ~/Applications/PhysCalc (your my_equations.js / user_constants.js are kept on re-install)
#   • adds a launchd agent so a tiny local server starts at login: http://localhost:31415
#   • opens it in Chrome
# Run:  bash install.sh        Undo:  bash ~/Applications/PhysCalc/uninstall.sh
set -euo pipefail

PORT="${PHYSCALC_PORT:-31415}"
SRC="$(cd "$(dirname "$0")" && pwd)"
DEST="$HOME/Applications/PhysCalc"
LABEL="com.physcalc.server"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/physcalc.log"

# 1. a python3 that really runs (the /usr/bin/python3 stub only works once Xcode CLT are installed)
PY=""
for c in /opt/homebrew/bin/python3 /usr/local/bin/python3 "$(command -v python3 2>/dev/null || true)" /usr/bin/python3; do
  if [ -n "$c" ] && [ -x "$c" ]; then
    real="$("$c" -c 'import sys, http.server; print(sys.executable)' 2>/dev/null || true)"
    if [ -n "$real" ] && [ -x "$real" ]; then PY="$real"; break; fi
  fi
done
if [ -z "$PY" ]; then
  echo "✗ No working python3 found."
  echo "  Install one with:  xcode-select --install   (or: brew install python), then run this again."
  exit 1
fi
echo "• python:  $PY"

# 2. copy files
mkdir -p "$DEST" "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
if [ "$SRC" != "$DEST" ]; then
  rsync -a --exclude 'equations/my_equations.js' --exclude 'data/user_constants.js' --exclude '.DS_Store' "$SRC"/ "$DEST"/
  for f in equations/my_equations.js data/user_constants.js; do
    [ -f "$DEST/$f" ] || cp "$SRC/$f" "$DEST/$f"
  done
fi
chmod +x "$DEST/server.py" "$DEST/install.sh" "$DEST/uninstall.sh" 2>/dev/null || true
echo "• app:     $DEST"

# 3. launchd agent (starts at login, restarts if it ever stops)
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$PY</string>
    <string>$DEST/server.py</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict><key>PHYSCALC_PORT</key><string>$PORT</string></dict>
  <key>WorkingDirectory</key><string>$DEST</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLIST
launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
launchctl enable "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
echo "• server:  launchd agent $LABEL (log: $LOG)"

# 4. check it answers
ok=""
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "http://127.0.0.1:$PORT/index.html" >/dev/null 2>&1; then ok=1; break; fi
  sleep 0.5
done
if [ -z "$ok" ]; then
  echo "✗ The server did not answer on port $PORT. Last log lines:"; tail -n 20 "$LOG" 2>/dev/null || true
  exit 1
fi
echo "✓ PhysCalc is running at http://localhost:$PORT"

open -a "Google Chrome" "http://localhost:$PORT/" 2>/dev/null || open "http://localhost:$PORT/"
echo
echo "Tip: in Chrome use  ⋮ → Cast, save, and share → Install page as app…  for its own window and Dock icon."
