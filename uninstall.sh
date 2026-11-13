#!/bin/bash
# Stops the PhysCalc server and removes its login item (and, on Linux, the menu entry).
# Add --all to also delete the installed files.
set -uo pipefail
if [ "$(uname -s)" = Darwin ]; then
  DEST="$HOME/Applications/PhysCalc"
  LABEL="com.physcalc.server"
  launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
  rm -f "$HOME/Library/LaunchAgents/$LABEL.plist"
else
  DEST="${XDG_DATA_HOME:-$HOME/.local/share}/physcalc"
  CONF="${XDG_CONFIG_HOME:-$HOME/.config}"
  if command -v systemctl >/dev/null 2>&1; then
    systemctl --user disable --now physcalc.service >/dev/null 2>&1 || true
    rm -f "$CONF/systemd/user/physcalc.service"
    systemctl --user daemon-reload >/dev/null 2>&1 || true
  fi
  pkill -f "$DEST/server.py" >/dev/null 2>&1 || true
  rm -f "$CONF/autostart/physcalc-server.desktop" "${XDG_DATA_HOME:-$HOME/.local/share}/applications/physcalc.desktop"
fi
echo "✓ Server stopped and login item removed."
if [ "${1:-}" = "--all" ]; then
  rm -rf "$DEST"
  echo "✓ Deleted $DEST (worksheets live in the browser's storage; export them first if you need them)."
else
  echo "  Files are still in $DEST (run with --all to delete them; that also deletes the equations you added)."
fi
