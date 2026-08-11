#!/usr/bin/env bash
# Kéo registry + weights auto-train từ Contabo về Mac — giữ parity inference local vs VPS.
# Usage:
#   SSH_KEY=~/.ssh/vifence_contabo ./scripts/pull-auto-train.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VPS_HOST="${VPS_HOST:-217.217.253.247}"
VPS_USER="${VPS_USER:-root}"
REMOTE_DIR="${REMOTE_DIR:-/opt/vifence/backend-ai}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/vifence_contabo}"
LOCAL_DIR="${ROOT}/backend-ai/data/auto_train"

ssh_rsh() {
  if [[ -f "$SSH_KEY" ]]; then
    echo "ssh -i $SSH_KEY -o StrictHostKeyChecking=no"
  else
    echo "ssh -o StrictHostKeyChecking=no"
  fi
}

RSYNC_SSH="$(ssh_rsh)"
mkdir -p "$LOCAL_DIR"

echo "→ Pull registry.json + *.pt từ ${VPS_USER}@${VPS_HOST}:${REMOTE_DIR}/data/auto_train/ …"
rsync -avz \
  --include 'registry.json' \
  --include '*/' \
  --include '*.pt' \
  --exclude '*' \
  -e "$RSYNC_SSH" \
  "${VPS_USER}@${VPS_HOST}:${REMOTE_DIR}/data/auto_train/" \
  "$LOCAL_DIR/"

echo ""
echo "✓ Auto-train artifacts local: ${LOCAL_DIR}"
echo "  Kiểm tra: backend-ai/.venv/bin/python -c \"import json; print(json.load(open('${LOCAL_DIR}/registry.json')))\" 2>/dev/null || echo '  (chưa có registry trên VPS)'"
