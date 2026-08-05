#!/usr/bin/env bash
# Giữ backend AI sống — tự restart khi bị OOM kill (exit ≠ 0).
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
LOG="${VIFENCE_BACKEND_LOG:-/tmp/vifence_backend.log}"

echo "[watchdog] backend-ai @ $ROOT — log: $LOG"
while true; do
  echo "[watchdog] starting uvicorn $(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG"
  .venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" >> "$LOG" 2>&1
  code=$?
  echo "[watchdog] uvicorn exited code=$code $(date '+%Y-%m-%d %H:%M:%S')" >> "$LOG"
  sleep 2
done
