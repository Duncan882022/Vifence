#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

pkill -f "uvicorn app.main:app" 2>/dev/null || true
pkill -f "ngrok http 8000" 2>/dev/null || true
sleep 1

echo "→ Backend :8000"
cd backend-ai
nohup .venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 >> /tmp/vifence_backend.log 2>&1 &
cd "$ROOT"
sleep 3

if ! curl -sf http://127.0.0.1:8000/health >/dev/null; then
  echo "✗ Backend không lên — xem /tmp/vifence_backend.log"
  exit 1
fi
echo "   Backend OK"

echo "→ Ngrok tunnel"
nohup ngrok http 8000 --log=/tmp/vifence_ngrok.log >/dev/null 2>&1 &
sleep 3

NGROK_URL=""
for _ in 1 2 3 4 5; do
  NGROK_URL="$(curl -sf http://127.0.0.1:4040/api/tunnels 2>/dev/null | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(next(t['public_url'] for t in d.get('tunnels', []) if t.get('proto') == 'https'))
" 2>/dev/null || true)"
  [[ -n "$NGROK_URL" ]] && break
  sleep 2
done

if [[ -z "$NGROK_URL" ]]; then
  echo "✗ Ngrok không lên — xem /tmp/vifence_ngrok.log"
  exit 1
fi

echo "   Ngrok: $NGROK_URL"

if [[ -f .env.local ]]; then
  if grep -q "^VITE_MOBILE_AI_BACKEND_URL=" .env.local; then
    sed -i '' "s|^VITE_MOBILE_AI_BACKEND_URL=.*|VITE_MOBILE_AI_BACKEND_URL=${NGROK_URL}|" .env.local
  else
    echo "VITE_MOBILE_AI_BACKEND_URL=${NGROK_URL}" >> .env.local
  fi
else
  echo "VITE_MOBILE_AI_BACKEND_URL=${NGROK_URL}" > .env.local
fi

if curl -sf "$NGROK_URL/health" -H "ngrok-skip-browser-warning: true" >/dev/null; then
  echo "   Tunnel OK"
else
  echo "   ⚠ Tunnel chưa phản hồi — thử lại sau vài giây"
fi

echo ""
echo "✓ Backend + ngrok đang chạy nền."
echo "  Local:  http://127.0.0.1:8000/health"
echo "  Ngrok:  $NGROK_URL/health"
echo "  Dashboard ngrok: http://127.0.0.1:4040"
echo ""
echo "Chạy FE: npm run dev -- --host 127.0.0.1 --port 5173"
echo "Nếu icon Wifi vẫn đỏ: hard refresh (Cmd+Shift+R) hoặc xóa localStorage key vifence_mobile_ai_backend_url"
