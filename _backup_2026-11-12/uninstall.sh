#!/bin/bash
# Stops the PhysCalc server and removes its login item.  Add --all to also delete ~/Applications/PhysCalc.
set -uo pipefail
LABEL="com.physcalc.server"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
launchctl bootout "gui/$(id -u)/$LABEL" >/dev/null 2>&1 || true
rm -f "$PLIST"
echo "✓ Server stopped and login item removed."
if [ "${1:-}" = "--all" ]; then
  rm -rf "$HOME/Applications/PhysCalc"
  echo "✓ Deleted ~/Applications/PhysCalc (worksheets live in Chrome's storage; export them first if you need them)."
else
  echo "  Files are still in ~/Applications/PhysCalc (run with --all to delete them)."
fi
