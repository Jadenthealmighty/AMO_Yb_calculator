#!/bin/bash
# PhysCalc installer for macOS and Linux (written for Kubuntu; any systemd desktop should work).
#   • copies the app to   macOS: ~/Applications/PhysCalc      Linux: ~/.local/share/physcalc
#     (your equations and constants are kept when you re-install: equations/custom_equations.js,
#      equations/my_equations.js, data/user_constants.js)
#   • starts a tiny local server at login: http://localhost:31415
#       macOS: a launchd agent      Linux: a systemd user service (or an autostart entry without systemd)
#   • Linux: adds "PhysCalc" to the application menu
#   • opens it in the browser
# Run:  bash install.sh        Undo:  bash uninstall.sh   (in the installed folder)
set -euo pipefail

PORT="${PHYSCALC_PORT:-31415}"
SRC="$(cd "$(dirname "$0")" && pwd)"
OS="$(uname -s)"
URL="http://localhost:$PORT/"
case "$OS" in
  Darwin) DEST="$HOME/Applications/PhysCalc"; LOG="$HOME/Library/Logs/physcalc.log" ;;
  Linux)  DEST="${XDG_DATA_HOME:-$HOME/.local/share}/physcalc"; LOG="${XDG_STATE_HOME:-$HOME/.local/state}/physcalc.log" ;;
  *) echo "✗ Unsupported system: $OS (macOS and Linux only). You can still run:  python3 server.py"; exit 1 ;;
esac
KEEP=(equations/custom_equations.js equations/my_equations.js data/user_constants.js)

# 1. a python3 that really runs (on macOS the /usr/bin/python3 stub only works once Xcode CLT are installed)
PY=""
for c in /opt/homebrew/bin/python3 /usr/local/bin/python3 "$(command -v python3 2>/dev/null || true)" /usr/bin/python3; do
  if [ -n "$c" ] && [ -x "$c" ]; then
    real="$("$c" -c 'import sys, http.server; print(sys.executable)' 2>/dev/null || true)"
    if [ -n "$real" ] && [ -x "$real" ]; then PY="$real"; break; fi
  fi
done
if [ -z "$PY" ]; then
  echo "✗ No working python3 found."
  if [ "$OS" = Darwin ]; then echo "  Install one with:  xcode-select --install   (or: brew install python), then run this again."
  else echo "  Install one with:  sudo apt install python3   then run this again."; fi
  exit 1
fi
echo "• python:  $PY"

# 2. copy files (never overwriting the files that hold your own equations and constants)
mkdir -p "$DEST" "$(dirname "$LOG")"
if [ "$SRC" != "$DEST" ]; then
  if command -v rsync >/dev/null 2>&1; then
    args=(-a --exclude '.DS_Store' --exclude '.git' --exclude '_backup*')
    for f in "${KEEP[@]}"; do args+=(--exclude "/$f"); done
    rsync "${args[@]}" "$SRC"/ "$DEST"/
  else
    args=(--exclude './.git' --exclude './_backup*' --exclude '.DS_Store')
    for f in "${KEEP[@]}"; do args+=(--exclude "./$f"); done
    (cd "$SRC" && tar cf - "${args[@]}" .) | (cd "$DEST" && tar xf -)
  fi
  for f in "${KEEP[@]}"; do
    if [ ! -f "$DEST/$f" ] && [ -f "$SRC/$f" ]; then mkdir -p "$(dirname "$DEST/$f")"; cp "$SRC/$f" "$DEST/$f"; fi
  done
fi
chmod +x "$DEST/server.py" "$DEST/install.sh" "$DEST/uninstall.sh" 2>/dev/null || true
echo "• app:     $DEST"

# 3. keep the server running
if [ "$OS" = Darwin ]; then
  LABEL="com.physcalc.server"
  PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
  mkdir -p "$HOME/Library/LaunchAgents"
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
else
  CONF="${XDG_CONFIG_HOME:-$HOME/.config}"
  UNIT="$CONF/systemd/user/physcalc.service"
  AUTOSTART="$CONF/autostart/physcalc-server.desktop"
  if command -v systemctl >/dev/null 2>&1 && systemctl --user show-environment >/dev/null 2>&1; then
    mkdir -p "$(dirname "$UNIT")"
    cat > "$UNIT" <<UNIT
[Unit]
Description=PhysCalc local server ($URL)

[Service]
ExecStart="$PY" "$DEST/server.py"
Environment=PHYSCALC_PORT=$PORT
Environment=PHYSCALC_HOST=${PHYSCALC_HOST:-127.0.0.1}
WorkingDirectory=$DEST
Restart=on-failure
RestartSec=2

[Install]
WantedBy=default.target
UNIT
    rm -f "$AUTOSTART"
    systemctl --user daemon-reload
    systemctl --user enable physcalc.service >/dev/null 2>&1
    systemctl --user restart physcalc.service
    echo "• server:  systemd user service physcalc.service  (status: systemctl --user status physcalc)"
  else
    # no systemd user session: start it now and again at every desktop login
    mkdir -p "$(dirname "$AUTOSTART")"
    cat > "$AUTOSTART" <<DESK
[Desktop Entry]
Type=Application
Name=PhysCalc server
Exec=env PHYSCALC_PORT=$PORT PHYSCALC_HOST=${PHYSCALC_HOST:-127.0.0.1} "$PY" "$DEST/server.py"
X-GNOME-Autostart-enabled=true
NoDisplay=true
DESK
    pkill -f "$DEST/server.py" >/dev/null 2>&1 || true
    PHYSCALC_PORT="$PORT" PHYSCALC_HOST="${PHYSCALC_HOST:-127.0.0.1}" nohup "$PY" "$DEST/server.py" >"$LOG" 2>&1 &
    echo "• server:  started now; starts at login via $AUTOSTART (log: $LOG)"
  fi

  # application-menu entry; Chrome/Chromium give it its own window, otherwise the default browser opens it
  BROWSER=""
  for b in google-chrome google-chrome-stable chromium chromium-browser brave-browser microsoft-edge vivaldi; do
    if command -v "$b" >/dev/null 2>&1; then BROWSER="$(command -v "$b")"; break; fi
  done
  if [ -n "$BROWSER" ]; then OPEN="\"$BROWSER\" --app=$URL"; else OPEN="xdg-open $URL"; fi
  APPS="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
  mkdir -p "$APPS"
  cat > "$APPS/physcalc.desktop" <<DESK
[Desktop Entry]
Type=Application
Name=PhysCalc
Comment=Physics calculator with units, Yb data, equations and plots
Exec=$OPEN
Icon=$DEST/icons/icon-512.png
Terminal=false
Categories=Education;Science;Math;
DESK
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPS" >/dev/null 2>&1 || true
  echo "• menu:    PhysCalc added to the application menu ($APPS/physcalc.desktop)"
fi

# 4. check it answers
ok=""
for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
  if "$PY" -c "import urllib.request,sys; urllib.request.urlopen('http://127.0.0.1:$PORT/index.html', timeout=2)" >/dev/null 2>&1; then ok=1; break; fi
  sleep 0.5
done
if [ -z "$ok" ]; then
  echo "✗ The server did not answer on port $PORT."
  if [ "$OS" = Linux ] && command -v journalctl >/dev/null 2>&1; then journalctl --user -u physcalc -n 20 --no-pager 2>/dev/null || true; fi
  tail -n 20 "$LOG" 2>/dev/null || true
  echo "  If another program uses the port, try:  PHYSCALC_PORT=31416 bash install.sh"
  exit 1
fi
echo "✓ PhysCalc is running at $URL"

# 5. open it
if [ "$OS" = Darwin ]; then
  open -a "Google Chrome" "$URL" 2>/dev/null || open "$URL"
  echo
  echo "Tip: in Chrome use  ⋮ → Cast, save, and share → Install page as app…  for its own window and Dock icon."
elif [ -n "${DISPLAY:-}${WAYLAND_DISPLAY:-}" ]; then
  if [ -n "$BROWSER" ]; then nohup "$BROWSER" --app="$URL" >/dev/null 2>&1 &
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL" >/dev/null 2>&1 || true; fi
  echo
  echo "Tip: PhysCalc is now in the application menu (search “PhysCalc”); right-click it there to pin it to the panel."
else
  echo "  Open $URL in a browser on this computer."
fi
