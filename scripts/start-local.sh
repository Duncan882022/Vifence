#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env.local ]]; then
  cp .env.ghpages .env.local
  echo "→ Đã tạo .env.local từ .env.ghpages"
fi

BACKEND_PID=""
cleanup() {
  if [[ -n "$BACKEND_PID" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

echo "→ Khởi động backend :8000…"
cd backend-ai
.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 >> /tmp/vifence_backend.log 2>&1 &
BACKEND_PID=$!
cd "$ROOT"
sleep 2

if curl -sf http://127.0.0.1:8000/health >/dev/null; then
  echo "   Backend OK"
else
  echo "   ⚠ Backend chưa sẵn sàng — xem /tmp/vifence_backend.log"
fi

echo "→ Khởi động frontend http://127.0.0.1:5173 …"
npm run dev -- --host 127.0.0.1 --port 5173
