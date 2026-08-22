#!/usr/bin/env bash
# Backend nhẹ cho Module 05 — tắt VMS A-03/A-04 (tránh OOM kill trên Mac).
# HC-02 mobile (POST /analyze/frame) + API /patrol/* vẫn chạy bình thường.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/backend-ai"

HEALTH_URL="http://127.0.0.1:8000/health"
LOG="/tmp/vifence_backend.log"

if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
  echo "✓ Backend đang chạy — ${HEALTH_URL}"
  exit 0
fi

pkill -f "run_backend_watchdog.sh" 2>/dev/null || true
pkill -f "uvicorn app.main:app" 2>/dev/null || true
sleep 1

echo "→ Khởi động backend patrol (VMS tắt) — ${HEALTH_URL}"
export VMS_MODE_ENABLED=false
nohup bash scripts/run_backend_watchdog.sh >> "$LOG" 2>&1 &
BACKEND_PID=$!

for _ in $(seq 1 30); do
  if curl -sf "$HEALTH_URL" >/dev/null; then
    echo "✓ Backend patrol OK (watchdog PID ${BACKEND_PID})"
    echo "  HC-02: mobile stream · HC-01 live: dùng Contabo hoặc bật VMS trong .env"
    exit 0
  fi
  sleep 1
done

echo "✗ Backend chưa sẵn sàng — xem ${LOG}"
tail -30 "$LOG" || true
exit 1
