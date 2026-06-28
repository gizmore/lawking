#!/usr/bin/env bash
# lawking offline starter for Linux
set -euo pipefail

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-8765}"
HOST="127.0.0.1"
URL="http://${HOST}:${PORT}/browser.html"
LOG="$APP_DIR/lawking-httpd.log"

cd "$APP_DIR"

find_python() {
  if command -v python3 >/dev/null 2>&1; then
    echo python3
  elif command -v python >/dev/null 2>&1; then
    echo python
  else
    echo ""
  fi
}

PYTHON="$(find_python)"
if [[ -z "$PYTHON" ]]; then
  echo "Python wurde nicht gefunden. Bitte python3 installieren."
  exit 1
fi

if command -v lsof >/dev/null 2>&1 && lsof -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Port $PORT ist bereits belegt. Öffne vorhandene Instanz: $URL"
else
  "$PYTHON" -m http.server "$PORT" --bind "$HOST" >"$LOG" 2>&1 &
  SERVER_PID="$!"
  echo "$SERVER_PID" > "$APP_DIR/lawking-httpd.pid"
fi

for _ in {1..80}; do
  if command -v curl >/dev/null 2>&1; then
    curl -fsS "$URL" >/dev/null 2>&1 && break
  elif command -v wget >/dev/null 2>&1; then
    wget -q --spider "$URL" >/dev/null 2>&1 && break
  else
    sleep 0.5
    break
  fi
  sleep 0.1
done

if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "$URL" >/dev/null 2>&1 &
elif command -v sensible-browser >/dev/null 2>&1; then
  sensible-browser "$URL" >/dev/null 2>&1 &
else
  echo "Bitte im Browser öffnen: $URL"
fi

echo "lawking offline läuft: $URL"
echo "Log: $LOG"
echo "Stoppen: pkill -F lawking-httpd.pid  # oder Terminal schließen"

if [[ -n "${SERVER_PID:-}" ]]; then
  wait "$SERVER_PID"
fi
