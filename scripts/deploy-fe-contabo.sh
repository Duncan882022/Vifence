#!/usr/bin/env bash
# Deploy FE static (docs/) lên Contabo — fallback khi GitHub Pages chưa bật.
# Usage: SSH_KEY=~/.ssh/vifence_contabo ./scripts/deploy-fe-contabo.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOCS="${ROOT}/docs"
VPS_HOST="${VPS_HOST:-217.217.253.247}"
VPS_USER="${VPS_USER:-root}"
REMOTE_FE="${REMOTE_FE:-/opt/vifence/frontend}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/vifence_contabo}"

materialize_contabo_ssh_key() {
  if [[ -f "$SSH_KEY" ]]; then return 0; fi
  if [[ -z "${VIFENCE_CONTABO_SSH_PRIVATE_KEY:-}" ]]; then return 1; fi
  mkdir -p "$(dirname "$SSH_KEY")"
  chmod 700 "$(dirname "$SSH_KEY")"
  printf '%b\n' "$VIFENCE_CONTABO_SSH_PRIVATE_KEY" > "$SSH_KEY"
  chmod 600 "$SSH_KEY"
}

materialize_contabo_ssh_key || true

ssh_cmd() {
  if [[ -f "$SSH_KEY" ]]; then
    ssh -i "$SSH_KEY" -o StrictHostKeyChecking=no "${VPS_USER}@${VPS_HOST}" "$@"
  else
    ssh -o StrictHostKeyChecking=no "${VPS_USER}@${VPS_HOST}" "$@"
  fi
}

rsync_cmd() {
  local ssh_rsh
  if [[ -f "$SSH_KEY" ]]; then
    ssh_rsh="ssh -i $SSH_KEY -o StrictHostKeyChecking=no"
  else
    ssh_rsh="ssh -o StrictHostKeyChecking=no"
  fi
  rsync -avz --delete \
    --exclude '.git/' \
    -e "$ssh_rsh" \
    "${DOCS}/" "${VPS_USER}@${VPS_HOST}:${REMOTE_FE}/"
}

if [[ ! -f "${DOCS}/index.html" ]]; then
  echo "→ Build FE trước…"
  (cd "$ROOT" && npm run build:pages)
fi

echo "→ Rsync FE → ${VPS_USER}@${VPS_HOST}:${REMOTE_FE}…"
ssh_cmd "mkdir -p ${REMOTE_FE}"
rsync_cmd

echo "→ Cập nhật nginx (serve /Vifence/ static)…"
ssh_cmd "python3 -c \"
from pathlib import Path
import re
path = Path('/etc/nginx/sites-available/vifence-api')
text = path.read_text()
snippet = '''
    location = /Vifence {
        return 301 /Vifence/;
    }
    location /Vifence/ {
        alias /opt/vifence/frontend/;
        index index.html;
    }

'''
if 'location /Vifence/' not in text:
    new_text, n = re.subn(r'(\\n    location / \\{)', '\\n' + snippet + r'\\1', text)
    if n:
        path.write_text(new_text)
        print(f'patched {n} block(s)')
    else:
        print('WARN: no location / block to patch')
else:
    print('nginx already has /Vifence/')
\" && nginx -t && systemctl reload nginx"

API_URL="https://${API_DOMAIN:-217.217.253.247.nip.io}"
echo ""
echo "✓ FE deploy xong."
echo "  Module 05: ${API_URL}/Vifence/module05/"
echo "  Root:      ${API_URL}/Vifence/"
