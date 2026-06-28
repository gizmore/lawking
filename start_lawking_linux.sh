#!/usr/bin/env bash
# Copyright (c) 2026 chappy and gizmore. all rights reserved

set -euo pipefail

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-8765}"
URL="http://127.0.0.1:${PORT}/"

cd "$APP_DIR"

if [[ ! -x "./lawking" ]]; then
  echo "Missing executable: ./lawking"
  echo "Build it with: go build -o lawking lawking.go"
  exit 1
fi

# Start Go server in background.
# Your lawking.go should serve current directory.
"./lawking" > lawking.log 2>&1 &
SERVER_PID="$!"

cleanup() {
  if kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

# Wait until server responds.
for i in {1..50}; do
  if command -v curl >/dev/null 2>&1; then
    if curl -fsS "$URL" >/dev/null 2>&1; then
      break
    fi
  else
    sleep 0.1
    break
  fi
  sleep 0.1
done

# Prefer bundled Chrome/Chromium if present.
if [[ -x "$APP_DIR/chrome/chrome" ]]; then
  CHROME="$APP_DIR/chrome/chrome"
elif command -v google-chrome >/dev/null 2>&1; then
  CHROME="google-chrome"
elif command -v google-chrome-stable >/dev/null 2>&1; then
  CHROME="google-chrome-stable"
elif command -v chromium >/dev/null 2>&1; then
  CHROME="chromium"
elif command -v chromium-browser >/dev/null 2>&1; then
  CHROME="chromium-browser"
else
  echo "Could not find Chrome/Chromium."
  echo "Open manually: $URL"
  wait "$SERVER_PID"
  exit 1
fi

PROFILE_DIR="$APP_DIR/chrome-profile"
mkdir -p "$PROFILE_DIR"

"$CHROME" \
  --app="$URL" \
  --user-data-dir="$PROFILE_DIR" \
  --no-first-run \
  --disable-default-apps \
  >/dev/null 2>&1 &

BROWSER_PID="$!"

echo "lawking running at $URL"
echo "server pid:  $SERVER_PID"
echo "browser pid: $BROWSER_PID"
echo "log:         $APP_DIR/lawking.log"
echo
echo "Press Ctrl+C to stop server."

wait "$SERVER_PID"
