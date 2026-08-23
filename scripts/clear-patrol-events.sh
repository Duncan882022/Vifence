#!/usr/bin/env bash
# Xóa toàn bộ sự kiện + snapshot trên backend-ai (RAM, JSONL, ảnh JPG).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_URL="${1:-${VITE_MOBILE_AI_BACKEND_URL:-}}"

if [[ -z "$BACKEND_URL" && -f "$ROOT/.env.local" ]]; then
  BACKEND_URL="$(grep -E '^VITE_MOBILE_AI_BACKEND_URL=' "$ROOT/.env.local" | head -1 | cut -d= -f2- | tr -d '"')"
fi

if [[ -z "$BACKEND_URL" ]]; then
  BACKEND_URL="http://127.0.0.1:8000"
fi

echo "→ DELETE ${BACKEND_URL%/}/events"
curl -fsS -X DELETE "${BACKEND_URL%/}/events" \
  -H 'ngrok-skip-browser-warning: true' \
  -H 'Accept: application/json'

echo ""
echo "→ Local snapshot dir (nếu có)"
if [[ -d "$ROOT/backend-ai/data/snapshots" ]]; then
  find "$ROOT/backend-ai/data/snapshots" -name '*.jpg' -delete 2>/dev/null || true
  echo "   Cleared backend-ai/data/snapshots/*.jpg"
fi

echo "Done. Hard refresh FE để xóa cache bridge mobile."
