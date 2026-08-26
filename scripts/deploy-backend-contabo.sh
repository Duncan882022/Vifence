#!/usr/bin/env bash
# Deploy backend-ai lên Contabo VPS (Ubuntu 22/24).
# Usage:
#   SSH_KEY=~/.ssh/vifence_contabo ./scripts/deploy-backend-contabo.sh
#   VIFENCE_CONTABO_SSH_PRIVATE_KEY=... ./scripts/deploy-backend-contabo.sh  # Cloud Agent runtime secret
#   SSHPASS='...' ./scripts/deploy-backend-contabo.sh   # fallback password
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL_CAM03="${LOCAL_CAM03:-${ROOT}/public/camera-feeds/ttdv-a-cam03-test.mp4}"
LOCAL_CAM04="${LOCAL_CAM04:-${ROOT}/public/camera-feeds/ttdv-a-cam04-test.mp4}"
VPS_HOST="${VPS_HOST:-217.217.253.247}"
VPS_USER="${VPS_USER:-root}"
REMOTE_DIR="${REMOTE_DIR:-/opt/vifence/backend-ai}"
API_DOMAIN="${API_DOMAIN:-217.217.253.247.nip.io}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/vifence_contabo}"

materialize_contabo_ssh_key() {
  if [[ -f "$SSH_KEY" ]]; then
    return 0
  fi
  if [[ -z "${VIFENCE_CONTABO_SSH_PRIVATE_KEY:-}" ]]; then
    return 1
  fi
  mkdir -p "$(dirname "$SSH_KEY")"
  chmod 700 "$(dirname "$SSH_KEY")"
  # Runtime secret — hỗ trợ PEM nhiều dòng hoặc \n escaped trong dashboard.
  printf '%b\n' "$VIFENCE_CONTABO_SSH_PRIVATE_KEY" > "$SSH_KEY"
  chmod 600 "$SSH_KEY"
  export SSH_KEY
}

materialize_contabo_ssh_key || true

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
    --filter='protect data/events/' \
    --filter='protect data/events/**' \
    --filter='protect data/snapshots/' \
    --filter='protect data/snapshots/**' \
    --filter='protect data/clips/' \
    --filter='protect data/clips/**' \
    --filter='protect data/hls/' \
    --filter='protect data/hls/**' \
    --exclude '.venv/' \
    --exclude '__pycache__/' \
    --exclude '*.pyc' \
    --exclude '.env' \
    --exclude '.tmp/' \
    --exclude 'data/hls/' \
    --exclude 'data/events.jsonl' \
    --exclude 'data/events/**/*.jsonl' \
    --exclude 'data/snapshots/**/*.jpg' \
    --exclude 'data/clips/**/*.mp4' \
    --exclude 'data/config/*.json' \
    --exclude 'data/config/*.jsonl' \
    --exclude 'data/auto_train/' \
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
  tesseract-ocr tesseract-ocr-vie tesseract-ocr-eng \
  libgl1 libglib2.0-0 libsm6 libxext6 libxrender1 libgomp1 \
  ffmpeg \
  curl rsync
REMOTE_PACKAGES

echo "→ Pre-deploy audit (13 nhóm ATLĐ)…"
if [[ "${SKIP_PRE_DEPLOY_AUDIT:-}" == "1" ]]; then
  echo "⚠ Bỏ qua audit (SKIP_PRE_DEPLOY_AUDIT=1)"
elif [[ -x "${ROOT}/backend-ai/.venv/bin/python" ]]; then
  mkdir -p "${ROOT}/backend-ai/.tmp"
  TMPDIR="${ROOT}/backend-ai/.tmp" \
  A03_BPTC_EVENT_LOGGING_ENABLED=true \
  ATGT_LANE_VIOLATION_ONLY=false \
  EVENT_TEST_MODE=true \
    "${ROOT}/backend-ai/.venv/bin/python" "${ROOT}/backend-ai/scripts/audit_pre_deploy.py" || {
    echo "✗ Pre-deploy audit FAIL — sửa backend trước khi rsync."
    exit 1
  }
else
  echo "⚠ Bỏ qua audit — chưa có backend-ai/.venv"
fi

echo "→ Rsync backend-ai…"
ssh_cmd "mkdir -p ${REMOTE_DIR}"
rsync_cmd

echo "→ Rsync model inference (crane_machinery + safety_mesh_cover + worker_face YOLO)…"
rsync_inference() {
  local ssh_rsh
  if [[ -n "${SSHPASS:-}" ]] && command -v sshpass >/dev/null 2>&1; then
    ssh_rsh="sshpass -e ssh -o StrictHostKeyChecking=no -o PreferredAuthentications=password -o PubkeyAuthentication=no"
  elif [[ -f "$SSH_KEY" ]]; then
    ssh_rsh="ssh -i $SSH_KEY -o StrictHostKeyChecking=no"
  else
    ssh_rsh="ssh -o StrictHostKeyChecking=no"
  fi
  for task in crane_machinery safety_mesh_cover worker_face; do
    ssh_cmd "mkdir -p ${REMOTE_DIR}/data/auto_train/${task}/images ${REMOTE_DIR}/data/auto_train/${task}/labels"
    local weights=""
    for v in v4_best.pt v3_best.pt v2_best.pt v1_best.pt; do
      if [[ -f "$ROOT/backend-ai/data/auto_train/${task}/${v}" ]]; then
        weights="$ROOT/backend-ai/data/auto_train/${task}/${v}"
        break
      fi
    done
    if [[ -n "$weights" ]]; then
      rsync -avz -e "$ssh_rsh" "$weights" \
        "${VPS_USER}@${VPS_HOST}:${REMOTE_DIR}/data/auto_train/${task}/$(basename "$weights")"
    fi
    if [[ -d "$ROOT/backend-ai/data/auto_train/${task}/images" ]]; then
      local n
      n="$(find "$ROOT/backend-ai/data/auto_train/${task}/images" -name '*.jpg' 2>/dev/null | wc -l | tr -d ' ')"
      if [[ "${n:-0}" -gt 0 ]]; then
        echo "   → ${task}: ${n} seed images…"
        rsync -avz -e "$ssh_rsh" \
          "$ROOT/backend-ai/data/auto_train/${task}/images/" \
          "${VPS_USER}@${VPS_HOST}:${REMOTE_DIR}/data/auto_train/${task}/images/"
        rsync -avz -e "$ssh_rsh" \
          "$ROOT/backend-ai/data/auto_train/${task}/labels/" \
          "${VPS_USER}@${VPS_HOST}:${REMOTE_DIR}/data/auto_train/${task}/labels/"
      fi
    fi
  done
  if [[ -f "$ROOT/backend-ai/data/auto_train/registry.json" ]]; then
    rsync -avz \
      -e "$ssh_rsh" \
      "$ROOT/backend-ai/data/auto_train/registry.json" \
      "${VPS_USER}@${VPS_HOST}:${REMOTE_DIR}/data/auto_train/registry.json"
  fi
}
rsync_inference

echo "→ Python venv + pip install…"
ssh_cmd "bash -s" <<REMOTE_VENV
set -euo pipefail
cd "${REMOTE_DIR}"
python3 -m venv .venv
.venv/bin/pip install -q --upgrade pip
.venv/bin/pip install -q -r requirements.txt
REMOTE_VENV

echo "→ MediaMTX (ingest thống nhất helmet HC-01/HC-02)…"
ssh_cmd "bash -s" <<'REMOTE_MEDIAMTX'
set -euo pipefail
MEDIAMTX_DIR=/opt/vifence
MEDIAMTX_BIN="${MEDIAMTX_DIR}/mediamtx"
MEDIAMTX_YML="${MEDIAMTX_DIR}/mediamtx.yml"
mkdir -p "${MEDIAMTX_DIR}/recordings"

if [[ ! -x "${MEDIAMTX_BIN}" ]]; then
  echo "   Tải MediaMTX binary…"
  cd "${MEDIAMTX_DIR}"
  curl -fsSL -o mediamtx.tar.gz \
    "https://github.com/bluenviron/mediamtx/releases/download/v1.11.3/mediamtx_v1.11.3_linux_amd64.tar.gz"
  tar xzf mediamtx.tar.gz
  rm -f mediamtx.tar.gz
  chmod +x "${MEDIAMTX_BIN}"
fi

cp /opt/vifence/backend-ai/deploy/mediamtx.yml "${MEDIAMTX_YML}"
# Relay chuẩn hoá timestamp cho nguồn RTSP ngoài — mediamtx.yml gọi qua runOnInit.
cp /opt/vifence/backend-ai/deploy/rtsp-relay.sh /opt/vifence/rtsp-relay.sh
chmod +x /opt/vifence/rtsp-relay.sh

cat > /etc/systemd/system/mediamtx.service <<'EOF'
[Unit]
Description=MediaMTX — helmet ingest (RTSP/WHIP/HLS)
After=network.target
Wants=network-online.target

[Service]
Type=simple
WorkingDirectory=/opt/vifence
ExecStart=/opt/vifence/mediamtx /opt/vifence/mediamtx.yml
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable mediamtx
systemctl restart mediamtx
sleep 2
systemctl is-active --quiet mediamtx && echo "   MediaMTX OK" || {
  journalctl -u mediamtx -n 20 --no-pager
  exit 1
}

# ICE media UDP — cần cho WHIP/WHEP qua 4G. Bỏ qua nếu ufw không bật.
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 8189/udp comment 'MediaMTX WebRTC ICE' 2>/dev/null || true
  ufw allow 8889/tcp comment 'MediaMTX WebRTC signaling' 2>/dev/null || true
  ufw allow 8888/tcp comment 'MediaMTX HLS' 2>/dev/null || true
fi
REMOTE_MEDIAMTX

echo "→ Thư mục video VPS (MP4 loop sources)…"
VPS_VIDEO_DIR="${VPS_VIDEO_DIR:-/opt/vifence/videos}"
ssh_cmd "mkdir -p ${VPS_VIDEO_DIR}"
rsync_cmd_file() {
  local src="$1" dst="$2"
  local ssh_rsh
  if [[ -n "${SSHPASS:-}" ]] && command -v sshpass >/dev/null 2>&1; then
    ssh_rsh="sshpass -e ssh -o StrictHostKeyChecking=no -o PreferredAuthentications=password -o PubkeyAuthentication=no"
  elif [[ -f "$SSH_KEY" ]]; then
    ssh_rsh="ssh -i $SSH_KEY -o StrictHostKeyChecking=no"
  else
    ssh_rsh="ssh -o StrictHostKeyChecking=no"
  fi
  rsync -avz -e "$ssh_rsh" "$src" "${VPS_USER}@${VPS_HOST}:${dst}"
}
clear_vms_hls_cache() {
  ssh_cmd "rm -rf /opt/vifence/backend-ai/data/hls/A-03 /opt/vifence/backend-ai/data/hls/A-04 2>/dev/null || true; mkdir -p /opt/vifence/backend-ai/data/hls/A-03 /opt/vifence/backend-ai/data/hls/A-04"
}
# Rsync video files nếu có local (bỏ qua nếu chưa có — cần upload thủ công lần đầu)
if [[ -n "${LOCAL_CAM03:-}" && -f "$LOCAL_CAM03" ]]; then
  echo "→ Upload cam03 video…"
  rsync_cmd_file "$LOCAL_CAM03" "${VPS_VIDEO_DIR}/cam03.mp4"
  clear_vms_hls_cache
fi
if [[ -n "${LOCAL_CAM04:-}" && -f "$LOCAL_CAM04" ]]; then
  echo "→ Upload cam04 video…"
  rsync_cmd_file "$LOCAL_CAM04" "${VPS_VIDEO_DIR}/cam04.mp4"
  clear_vms_hls_cache
fi
LOCAL_HC01_FALLBACK="${LOCAL_HC01_FALLBACK:-$ROOT/public/camera-feeds/bodycam-01.mp4}"
if [[ -n "${VPS_HC01_FALLBACK_MP4:-}" && -f "$LOCAL_HC01_FALLBACK" ]]; then
  echo "→ Upload HC-01 fallback bodycam video (chỉ khi VPS_HC01_FALLBACK_MP4=1)…"
  rsync_cmd_file "$LOCAL_HC01_FALLBACK" "${VPS_VIDEO_DIR}/bodycam-01.mp4"
fi

echo "→ .env production…"
# Chế độ ưu tiên Module 05: VPS 6 vCPU không gánh nổi 5 camera × 7 engine cùng
# OWLv2. Mặc định chỉ chạy bodycam/flycam tuần tra; đặt PRIORITIZE_MODULE05=0 để
# bật lại reel demo A-03/A-04 của Module 03/04.
PRIORITIZE_MODULE05="${PRIORITIZE_MODULE05:-1}"
VPS_VMS_ENABLED="${VPS_VMS_ENABLED:-true}"
VPS_VIDEO_A03="${VPS_VIDEO_A03:-${VPS_VIDEO_DIR}/cam03.mp4}"
VPS_VIDEO_A04="${VPS_VIDEO_A04:-${VPS_VIDEO_DIR}/cam04.mp4}"
VPS_DR03_RTSP="${VPS_DR03_RTSP:-rtsp://127.0.0.1:8554/dr03}"
# Mọi camera pull qua MediaMTX nội bộ, KHÔNG pull thẳng nguồn gốc.
#
# Gateway bodycam HC-01 chỉ phục vụ được một phiên RTSP: khi MediaMTX và VMS
# worker cùng nối tới `157.66.100.182`, hai bên liên tục đá nhau ra và log đầy
# `[RTSP source] EOF` mỗi ~20 giây — chính là cú khựng người xem thấy.
# MediaMTX là client duy nhất của nguồn gốc; worker và CMS đều đọc lại từ nó.
VPS_HC01_RTSP="${VPS_HC01_RTSP:-rtsp://127.0.0.1:8554/hc-01}"
VPS_PATROL_SOURCES="HC-01:${VPS_HC01_RTSP},HC-02:rtsp://127.0.0.1:8554/hc-02,DR-03:${VPS_DR03_RTSP}"

if [[ "$PRIORITIZE_MODULE05" == "1" ]]; then
  VPS_CAMERA_SOURCES="${VPS_PATROL_SOURCES}"
  VPS_AUTO_TRAIN_ENABLED="${VPS_AUTO_TRAIN_ENABLED:-false}"
  VPS_MACHINERY_ENABLED="${VPS_MACHINERY_ENABLED:-false}"
  # 5 FPS để lại 200ms giữa hai lần detect — đủ để người đi bộ trượt khỏi cổng
  # ghép và ROI phải ngoại suy gần hết quãng đó. Sau khi cắt OWLv2 và reel
  # A-03/A-04, tải VPS còn ~2.3/6 vCPU nên có chỗ cho nhịp dày hơn.
  VPS_AI_FPS="${VPS_AI_FPS:-8.0}"
  echo "   Ưu tiên Module 05: chỉ HC-01, HC-02, DR-03 (bỏ reel A-03/A-04, OWLv2, auto-train)"
else
  VPS_CAMERA_SOURCES="A-03:${VPS_VIDEO_A03},A-04:${VPS_VIDEO_A04},${VPS_PATROL_SOURCES}"
  VPS_AUTO_TRAIN_ENABLED="${VPS_AUTO_TRAIN_ENABLED:-true}"
  VPS_MACHINERY_ENABLED="${VPS_MACHINERY_ENABLED:-true}"
  VPS_AI_FPS="${VPS_AI_FPS:-10.0}"
  echo "   Chạy đủ camera (A-03, A-04 + tuần tra)"
fi
ssh_cmd "bash -s" <<REMOTE_ENV
set -euo pipefail
cat > /opt/vifence/backend-ai/.env <<EOF
HOST=0.0.0.0
PORT=8000
DETECTION_LOOP_ENABLED=false
AUTO_TRAIN_ENABLED=${VPS_AUTO_TRAIN_ENABLED}
AUTO_TRAIN_INFERENCE_ENABLED=${VPS_AUTO_TRAIN_ENABLED}
AUTO_TRAIN_SCHEDULE_HOURS_LOCAL=0,6,22
AUTO_TRAIN_SCHEDULE_TZ_OFFSET_HOURS=7
AUTO_TRAIN_SCHEDULE_WINDOW_MINUTES=90
AUTO_TRAIN_CHECK_INTERVAL_SECONDS=120
AUTO_TRAIN_MIN_INTERVAL_SECONDS=39600
AUTO_TRAIN_MIN_NEW_SAMPLES_DELTA=10
A03_BPTC_EVENT_LOGGING_ENABLED=true
ATGT_LANE_VIOLATION_ONLY=false
ATGT_DEMO_FAKE_PLATE_FALLBACK=false
EVENT_TEST_MODE=false
EVENT_FIRST_SEEN_WINDOW_SECONDS=10800
EVENT_AUDIT_GRACE_MINUTES=5
EVENT_AUDIT_GRACE_LOOPS=2
CAMERA_SOURCE=0
VMS_MODE_ENABLED=${VPS_VMS_ENABLED}
VMS_CAMERA_SOURCES=${VPS_CAMERA_SOURCES}
VMS_AI_FPS=${VPS_AI_FPS}
VMS_HLS_RELAY_SKIP_PREFIXES=HC-,DR-
VMS_AI_MAX_WIDTH=960
MEDIAMTX_HLS_PUBLIC_BASE=/mediamtx/hls
MEDIAMTX_PATH_OVERRIDES=DR-03:dr03
MACHINERY_DETECTOR_ENABLED=${VPS_MACHINERY_ENABLED}
WORKER_RECOGNITION_ENABLED=true
WORKER_DEMO_FALLBACK_ENABLED=false
WORKER_MATCH_MIN_CONFIDENCE=0.72
WORKER_MATCH_MIN_MARGIN=0.10
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
Environment=TORCHDYNAMO_DISABLE=1
Environment=PYTORCH_JIT=0
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
# CORS do FastAPI CORSMiddleware — không add_header trên nginx (tránh duplicate *, *)
ssh_cmd "bash -s" <<REMOTE_NGINX
set -euo pipefail
API_DOMAIN="${API_DOMAIN}"
VPS_HOST="${VPS_HOST}"
CERT_DIR="/etc/letsencrypt/live/\${API_DOMAIN}"

write_http_only() {
  cat > /etc/nginx/sites-available/vifence-api <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name \${API_DOMAIN} \${VPS_HOST};

    client_max_body_size 20M;

    location /mediamtx/webrtc/ {
        proxy_pass http://127.0.0.1:8889/;
        proxy_http_version 1.1;
        proxy_set_header Host \\\$host;
        proxy_set_header X-Real-IP \\\$remote_addr;
        proxy_set_header X-Forwarded-For \\\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\\$scheme;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
        client_max_body_size 1M;
    }

    location /mediamtx/hls/ {
        proxy_pass http://127.0.0.1:8888/;
        proxy_http_version 1.1;
        proxy_set_header Host \\\$host;
        proxy_set_header X-Real-IP \\\$remote_addr;
        proxy_buffering off;
        add_header Cache-Control "no-cache, no-store";
    }

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
}

write_https() {
  cat > /etc/nginx/sites-available/vifence-api <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name \${API_DOMAIN} \${VPS_HOST};
    return 301 https://\${API_DOMAIN}\\\$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name \${API_DOMAIN} \${VPS_HOST};

    ssl_certificate \${CERT_DIR}/fullchain.pem;
    ssl_certificate_key \${CERT_DIR}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    client_max_body_size 20M;

    location /mediamtx/webrtc/ {
        proxy_pass http://127.0.0.1:8889/;
        proxy_http_version 1.1;
        proxy_set_header Host \\\$host;
        proxy_set_header X-Real-IP \\\$remote_addr;
        proxy_set_header X-Forwarded-For \\\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\\$scheme;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
        client_max_body_size 1M;
    }

    location /mediamtx/hls/ {
        proxy_pass http://127.0.0.1:8888/;
        proxy_http_version 1.1;
        proxy_set_header Host \\\$host;
        proxy_set_header X-Real-IP \\\$remote_addr;
        proxy_buffering off;
        add_header Cache-Control "no-cache, no-store";
    }

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
}

if [[ -f "\${CERT_DIR}/fullchain.pem" && -f "\${CERT_DIR}/privkey.pem" ]]; then
  write_https
else
  write_http_only
fi

ln -sf /etc/nginx/sites-available/vifence-api /etc/nginx/sites-enabled/vifence-api
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
REMOTE_NGINX

echo "→ Let's Encrypt (HTTPS)…"
ssh_cmd "bash -s" <<REMOTE_SSL
set -euo pipefail
API_DOMAIN="${API_DOMAIN}"
CERT_DIR="/etc/letsencrypt/live/\${API_DOMAIN}"
if [[ -f "\${CERT_DIR}/fullchain.pem" ]]; then
  certbot renew --quiet || true
else
  certbot --nginx -d "\${API_DOMAIN}" --non-interactive --agree-tos --register-unsafely-without-email --redirect || \
    echo "⚠ Certbot thất bại — dùng tạm http://${VPS_HOST} (GitHub Pages cần HTTPS)"
fi
REMOTE_SSL

echo "→ Bật lại HTTPS nginx nếu đã có cert…"
ssh_cmd "bash -s" <<REMOTE_HTTPS_RELOAD
set -euo pipefail
API_DOMAIN="${API_DOMAIN}"
VPS_HOST="${VPS_HOST}"
CERT_DIR="/etc/letsencrypt/live/\${API_DOMAIN}"
if [[ -f "\${CERT_DIR}/fullchain.pem" && -f "\${CERT_DIR}/privkey.pem" ]] && ! grep -q 'listen 443' /etc/nginx/sites-available/vifence-api; then
  cat > /etc/nginx/sites-available/vifence-api <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name \${API_DOMAIN} \${VPS_HOST};
    return 301 https://\${API_DOMAIN}\\\$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name \${API_DOMAIN} \${VPS_HOST};

    ssl_certificate \${CERT_DIR}/fullchain.pem;
    ssl_certificate_key \${CERT_DIR}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    client_max_body_size 20M;

    location /mediamtx/webrtc/ {
        proxy_pass http://127.0.0.1:8889/;
        proxy_http_version 1.1;
        proxy_set_header Host \\\$host;
        proxy_set_header X-Real-IP \\\$remote_addr;
        proxy_set_header X-Forwarded-For \\\$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \\\$scheme;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
        client_max_body_size 1M;
    }

    location /mediamtx/hls/ {
        proxy_pass http://127.0.0.1:8888/;
        proxy_http_version 1.1;
        proxy_set_header Host \\\$host;
        proxy_set_header X-Real-IP \\\$remote_addr;
        proxy_buffering off;
        add_header Cache-Control "no-cache, no-store";
    }

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
  nginx -t
  systemctl reload nginx
fi
REMOTE_HTTPS_RELOAD

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
