#!/bin/sh
# Keep the board running in the background on macOS via a per-user LaunchAgent.
# Starts at login and restarts if it crashes.
#   sh scripts/service.sh install|uninstall|restart|status|logs
# Optional env: PORT (default 5180), DATA_FILE (default ./data/tasks.csv), NODE (default: node on PATH)
set -eu

LABEL="local.focus"
# The service was called this before the project was renamed.
OLD_LABEL="local.eisenhower-matrix"
DIR="$(cd "$(dirname "$0")/.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"
PORT="${PORT:-5180}"
DATA_FILE="${DATA_FILE:-$DIR/data/tasks.csv}"

case "${1:-}" in
  install)
    NODE="${NODE:-$(command -v node || true)}"
    [ -x "$NODE" ] || { echo "node not found; set NODE=/path/to/node" >&2; exit 1; }
    [ -f "$DIR/dist/index.html" ] || { echo "No build found. Run: npm run build" >&2; exit 1; }
    mkdir -p "$HOME/Library/LaunchAgents" "$DIR/logs"
    cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>$NODE</string><string>$DIR/server.mjs</string></array>
  <key>WorkingDirectory</key><string>$DIR</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key><string>$PORT</string>
    <key>DATA_FILE</key><string>$DATA_FILE</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$DIR/logs/server.log</string>
  <key>StandardErrorPath</key><string>$DIR/logs/server.log</string>
</dict>
</plist>
PLIST
    launchctl bootout "$DOMAIN" "$PLIST" 2>/dev/null || true
    # Retire the old-name service so two copies never fight over the port.
    OLD_PLIST="$HOME/Library/LaunchAgents/$OLD_LABEL.plist"
    if [ -f "$OLD_PLIST" ]; then
      launchctl bootout "$DOMAIN" "$OLD_PLIST" 2>/dev/null || true
      rm -f "$OLD_PLIST"
    fi
    launchctl bootstrap "$DOMAIN" "$PLIST"
    echo "Installed $LABEL → http://127.0.0.1:$PORT (data: $DATA_FILE)"
    ;;
  uninstall)
    launchctl bootout "$DOMAIN" "$PLIST" 2>/dev/null || true
    rm -f "$PLIST"
    echo "Removed $LABEL (your data file was not touched)"
    ;;
  restart) launchctl kickstart -k "$DOMAIN/$LABEL" ;;
  status) launchctl print "$DOMAIN/$LABEL" | grep -E '^\s*(state|pid|last exit code) =' ;;
  logs) tail -n 50 -f "$DIR/logs/server.log" ;;
  *) echo "usage: $0 install|uninstall|restart|status|logs" >&2; exit 2 ;;
esac
