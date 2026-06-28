#!/bin/bash
# lawking offline starter for macOS
set -euo pipefail

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-8765}"
HOST="127.0.0.1"
URL="http://${HOST}:${PORT}/browser.html"
LOG="$APP_DIR/lawking-httpd.log"

cd "$APP_DIR"

if command -v python3 >/dev/null 2>&1; then
  PYTHON=python3
elif command -v python >/dev/null 2>&1; then
  PYTHON=python
else
  echo "Python wurde nicht gefunden. Bitte Python 3 installieren."
  exit 1
fi

if command -v lsof >/dev/null 2>&1 && lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $PORT ist bereits belegt. Öffne vorhandene Instanz: $URL"
else
  "$PYTHON" -m http.server "$PORT" --bind "$HOST" >"$LOG" 2>&1 &
  SERVER_PID="$!"
  echo "$SERVER_PID" > "$APP_DIR/lawking-httpd.pid"
fi

for i in {1..80}; do
  if curl -fsS "$URL" >/dev/null 2>&1; then
    break
  fi
  sleep 0.1
done

open "$URL"

echo "lawking offline läuft: $URL"
echo "Log: $LOG"
echo "Stoppen: kill \$(cat lawking-httpd.pid)"

if [[ -n "${SERVER_PID:-}" ]]; then
  wait "$SERVER_PID"
fi
