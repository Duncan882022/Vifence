#!/usr/bin/env bash
set -euo pipefail

INFRA_DIR="${INFRA_DIR:-/opt/vifence/infra/contabo}"

install -m 644 "${INFRA_DIR}/systemd/mediamtx.service" /etc/systemd/system/mediamtx.service
install -m 644 "${INFRA_DIR}/systemd/vifence-backend.service" /etc/systemd/system/vifence-backend.service
systemctl daemon-reload
systemctl enable mediamtx vifence-backend
