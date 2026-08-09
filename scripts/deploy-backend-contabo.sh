#!/usr/bin/env bash
# Deploy backend-ai lên Contabo VPS (Ubuntu 22/24).
# Usage:
#   SSH_KEY=~/.ssh/vifence_contabo ./scripts/deploy-backend-contabo.sh
#   SSHPASS='...' ./scripts/deploy-backend-contabo.sh   # fallback password
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VPS_HOST="${VPS_HOST:-217.217.253.247}"
VPS_USER="${VPS_USER:-root}"
REMOTE_DIR="${REMOTE_DIR:-/opt/vifence/backend-ai}"
API_DOMAIN="${API_DOMAIN:-217.217.253.247.nip.io}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/vifence_contabo}"

ssh_cmd() {
  if [[ -n "${SSHPASS:-}" ]] && command -v sshpass >/dev/null 2>&1; then
    sshpass -e ssh -o StrictHostKeyChecking=no -o PreferredAuthentications=password -o PubkeyAuthentication=no \
      "${VPS_USER}@${VPS_HOST}" "$@"
  elif [[ -f "$SSH_KEY" ]]; then
    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "${VPS_USER}@${VPS_HOST}" "$@"
  else
    ssh -o StrictHostKeyChecking=no "${VPS_USER}@${VPS_HOST}" "$@"
  fi
}

rsync_cmd() {
  local ssh_rsh
  if [[ -n "${SSHPASS:-}" ]] && command -v sshpass >/dev/null 2>&1; then
    ssh_rsh="sshpass -e ssh -o StrictHostKeyChecking=no -o PreferredAuthentications=password -o PubkeyAuthentication=no"
  elif [[ -f "$SSH_KEY" ]]; then
    ssh_rsh="ssh -i $SSH_KEY -o StrictHostKeyChecking=no"
  else
    ssh_rsh="ssh -o StrictHostKeyChecking=no"
  fi
  rsync -avz --delete \
    --exclude '.venv/' \
    --exclude '__pycache__/' \
    --exclude '*.pyc' \
    --exclude '.env' \
    --exclude 'data/events.jsonl' \
    --exclude 'data/events/*.jsonl' \
    --exclude 'data/snapshots/*.jpg' \
    --exclude 'data/config/*.json' \
    -e "$ssh_rsh" \
    "$ROOT/backend-ai/" "${VPS_USER}@${VPS_HOST}:${REMOTE_DIR}/"
}

echo "→ Kiểm tra SSH tới ${VPS_USER}@${VPS_HOST}…"
ssh_cmd "echo SSH_OK && uname -a"

echo "→ Cài system packages…"
ssh_cmd "bash -s" <<'REMOTE_PACKAGES'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq \
  python3 python3-venv python3-pip \
  nginx certbot python3-certbot-nginx \
  libgl1 libglib2.0-0 libsm6 libxext6 libxrender1 libgomp1 \
  curl rsync
REMOTE_PACKAGES

echo "→ Rsync backend-ai…"
ssh_cmd "mkdir -p ${REMOTE_DIR}"
rsync_cmd

echo "→ Python venv + pip install…"
ssh_cmd "bash -s" <<REMOTE_VENV
set -euo pipefail
cd "${REMOTE_DIR}"
python3 -m venv .venv
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q -r requirements.txt
REMOTE_VENV

echo "→ .env production…"
ssh_cmd "bash -s" <<'REMOTE_ENV'
set -euo pipefail
cat > /opt/vifence/backend-ai/.env <<'EOF'
HOST=0.0.0.0
PORT=8000
DETECTION_LOOP_ENABLED=false
AUTO_TRAIN_ENABLED=false
AUTO_TRAIN_INFERENCE_ENABLED=true
CAMERA_SOURCE=0
EOF
REMOTE_ENV

echo "→ systemd service…"
ssh_cmd "bash -s" <<'REMOTE_SYSTEMD'
set -euo pipefail
cat > /etc/systemd/system/vifence-backend.service <<'EOF'
[Unit]
Description=Vifence Safety AI Backend
After=network.target

[Service]
Type=simple
WorkingDirectory=/opt/vifence/backend-ai
EnvironmentFile=/opt/vifence/backend-ai/.env
ExecStart=/opt/vifence/backend-ai/.venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5
TimeoutStartSec=120

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable vifence-backend
systemctl restart vifence-backend
REMOTE_SYSTEMD

echo "→ Nginx reverse proxy…"
ssh_cmd "bash -s" <<REMOTE_NGINX
set -euo pipefail
cat > /etc/nginx/sites-available/vifence-api <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${API_DOMAIN} ${VPS_HOST};

    client_max_body_size 20M;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \\\$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \\\$host;
        proxy_set_header X-Real-IP \\\$remote_addr;
        proxy_set_header X-Forwarded-For \\\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\\$scheme;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
EOF
ln -sf /etc/nginx/sites-available/vifence-api /etc/nginx/sites-enabled/vifence-api
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
REMOTE_NGINX

echo "→ Let's Encrypt (HTTPS)…"
ssh_cmd "bash -s" <<REMOTE_SSL
set -euo pipefail
if certbot certificates 2>/dev/null | grep -q "${API_DOMAIN}"; then
  certbot renew --quiet || true
else
  certbot --nginx -d "${API_DOMAIN}" --non-interactive --agree-tos --register-unsafely-without-email --redirect || \
    echo "⚠ Certbot thất bại — dùng tạm http://${VPS_HOST} (GitHub Pages cần HTTPS)"
fi
REMOTE_SSL

echo "→ Chờ /health…"
for i in 1 2 3 4 5 6 7 8 9 10; do
  if ssh_cmd "curl -sf http://127.0.0.1:8000/health >/dev/null"; then
    echo "   Backend OK (local)"
    break
  fi
  sleep 3
done

API_URL="https://${API_DOMAIN}"
if ! curl -sf "${API_URL}/health" >/dev/null 2>&1; then
  API_URL="http://${VPS_HOST}"
  if curl -sf "${API_URL}/health" >/dev/null 2>&1; then
    echo "⚠ HTTPS chưa sẵn — API tạm: ${API_URL}"
  else
    echo "⚠ Chưa ping được /health qua nginx — kiểm tra: systemctl status vifence-backend"
    API_URL="https://${API_DOMAIN}"
  fi
fi

echo ""
echo "✓ Deploy xong."
echo "  API: ${API_URL}"
echo "  Health: ${API_URL}/health"
echo ""
echo "Cập nhật FE:"
echo "  VITE_MOBILE_AI_BACKEND_URL=${API_URL}"
echo "  npm run build:pages && npm run deploy:pages"
