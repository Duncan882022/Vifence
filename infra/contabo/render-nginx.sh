#!/usr/bin/env bash
# Render /etc/nginx/sites-available/vifence-api từ infra/contabo (API + MediaMTX, không FE static).
set -euo pipefail

INFRA_DIR="${INFRA_DIR:-/opt/vifence/infra/contabo}"
API_DOMAIN="${API_DOMAIN:?API_DOMAIN required}"
VPS_HOST="${VPS_HOST:?VPS_HOST required}"
CERT_DIR="/etc/letsencrypt/live/${API_DOMAIN}"
LOCATIONS_FILE="${INFRA_DIR}/nginx/locations.inc"
SITE="/etc/nginx/sites-available/vifence-api"

if [[ ! -f "${LOCATIONS_FILE}" ]]; then
  echo "Missing ${LOCATIONS_FILE}" >&2
  exit 1
fi

LOCATIONS="$(cat "${LOCATIONS_FILE}")"

if [[ -f "${CERT_DIR}/fullchain.pem" && -f "${CERT_DIR}/privkey.pem" ]]; then
  cat > "${SITE}" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${API_DOMAIN} ${VPS_HOST};
    return 301 https://${API_DOMAIN}\$request_uri;
}

server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name ${API_DOMAIN} ${VPS_HOST};

    ssl_certificate ${CERT_DIR}/fullchain.pem;
    ssl_certificate_key ${CERT_DIR}/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    client_max_body_size 20M;

${LOCATIONS}
}
EOF
else
  cat > "${SITE}" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${API_DOMAIN} ${VPS_HOST};

    client_max_body_size 20M;

${LOCATIONS}
}
EOF
fi

ln -sf "${SITE}" /etc/nginx/sites-enabled/vifence-api
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx
echo "nginx: rendered $(grep -q 'listen 443' "${SITE}" && echo HTTPS || echo HTTP-only)"
