#!/usr/bin/env bash
# Chạy backend local :8000 (tách khỏi FE — không bị kill khi tắt npm run dev).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

bash "${ROOT}/scripts/setup-local-dev.sh"

HEALTH_URL="http://127.0.0.1:8000/health"
LOG="/tmp/vifence_backend.log"

if curl -sf "$HEALTH_URL" >/dev/null 2>&1; then
  EXISTING_PID="$(lsof -tiTCP:8000 -sTCP:LISTEN 2>/dev/null | head -1 || true)"
  echo "✓ Backend đang chạy (PID ${EXISTING_PID:-?}) — ${HEALTH_URL}"
  exit 0
fi

pkill -f "uvicorn app.main:app" 2>/dev/null || true
sleep 1

echo "→ Khởi động backend ${HEALTH_URL} (log: ${LOG})…"
cd backend-ai
nohup .venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 >> "$LOG" 2>&1 &
BACKEND_PID=$!
cd "$ROOT"

for i in $(seq 1 45); do
  if curl -sf "$HEALTH_URL" >/dev/null; then
    echo "✓ Backend OK (PID ${BACKEND_PID}) — ${HEALTH_URL}"
    exit 0
  fi
  sleep 1
done

echo "✗ Backend chưa sẵn sàng sau 45s — xem ${LOG}"
tail -40 "$LOG" || true
exit 1
