#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "→ Backend local (giữ chạy khi tắt FE)…"
bash "${ROOT}/scripts/start-backend-local.sh"

echo "→ Khởi động frontend http://127.0.0.1:5173 …"
npm run dev -- --host 127.0.0.1 --port 5173
