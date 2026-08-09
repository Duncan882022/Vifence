#!/usr/bin/env bash
# FE local → API Contabo. Không khởi động backend-ai / ngrok trên Mac.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -f .env.local ]]; then
  cp .env.example .env.local
  echo "→ Đã tạo .env.local từ .env.example"
fi

BACKEND_URL="$(grep -E '^VITE_MOBILE_AI_BACKEND_URL=' .env.local | cut -d= -f2- | tr -d '"' || true)"
if [[ -z "$BACKEND_URL" ]]; then
  echo "✗ Thiếu VITE_MOBILE_AI_BACKEND_URL trong .env.local"
  exit 1
fi

echo "→ Backend API: $BACKEND_URL"
if curl -sf "${BACKEND_URL}/health" >/dev/null 2>&1; then
  echo "   /health OK"
else
  echo "   ⚠ Chưa ping được /health — vẫn chạy FE (kiểm tra mạng/VPS)"
fi

echo "→ Frontend http://127.0.0.1:5173/module03"
npm run dev -- --host 127.0.0.1 --port 5173
