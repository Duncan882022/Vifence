#!/usr/bin/env bash
# Thiết lập FE → BE local + backend .env khớp VPS (VMS test MP4, inference từ weights đã pull).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CAM03="${ROOT}/public/camera-feeds/ttdv-a-cam03-test.mp4"
CAM04="${ROOT}/public/camera-feeds/ttdv-a-cam04-test.mp4"

cat > .env.local <<EOF
# Local dev — FE :5173 → BE :8000 (npm run start:local)
VITE_MOBILE_AI_BACKEND_URL=http://127.0.0.1:8000
VITE_VMS_BACKEND_URL=http://127.0.0.1:8000
EOF
echo "→ .env.local → http://127.0.0.1:8000"

mkdir -p backend-ai/data/auto_train
if [[ ! -f backend-ai/.env ]]; then
  cat > backend-ai/.env <<EOF
HOST=0.0.0.0
PORT=8000
DETECTION_LOOP_ENABLED=false
AUTO_TRAIN_ENABLED=false
AUTO_TRAIN_INFERENCE_ENABLED=true
VMS_MODE_ENABLED=true
VMS_CAMERA_SOURCES=A-03:${CAM03},A-04:${CAM04}
VMS_AI_FPS=6.0
EOF
  echo "→ Tạo backend-ai/.env (VMS local, auto-train tắt thu mẫu)"
else
  echo "→ Giữ backend-ai/.env hiện có"
fi

echo ""
echo "✓ Local dev sẵn sàng."
echo "  1. SSH_KEY=~/.ssh/vifence_contabo ./scripts/pull-auto-train.sh  (parity weights)"
echo "  2. npm run start:local"
