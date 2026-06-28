#!/usr/bin/env bash
set -euo pipefail

OUT="${1:-chappers_dev.zip}"

rm -f "$OUT"

zip -r "$OUT" . \
  -x "$OUT" \
  -x "*.zip" \
  -x ".git/*" \
  -x "__pycache__/*" \
  -x "*/__pycache__/*" \
  -x "*.pyc" \
  -x "*.pyo" \
  -x ".pytest_cache/*" \
  -x ".mypy_cache/*" \
  -x ".ruff_cache/*" \
  -x ".venv/*" \
  -x "venv/*" \
  -x "env/*" \
  -x "node_modules/*" \
  -x "*.log" \
  -x "*.sqlite" \
  -x "*.sqlite3" \
  -x "*.db" \
  -x "data/*" \
  -x "*/data/*" \
  -x "downloads/*" \
  -x "*/downloads/*" \
  -x "cache/*" \
  -x "*/cache/*" \
  -x "tmp/*" \
  -x "*/tmp/*" \
  -x "temp/*" \
  -x "*/temp/*" \
  -x "gesetze/*" \
  -x "out/*" \
  -x "public/gesetze/*" \
  -x "gesetze2" \
  -x "gesetze2/*" \
  -x "data" \
  -x "data/*" \
  -x "*/data" \
  -x "*/data/*" \
  -x "yarn.lock" \
  -x "public/data/*"

echo "Created $OUT"

