#!/usr/bin/env bash
# Deprecated — FE chỉ deploy qua GitHub Pages.
# Contabo nginx không còn serve /Vifence/ static (xem infra/contabo/).
set -euo pipefail
echo "✗ deploy-fe-contabo.sh đã ngừng dùng."
echo "  FE: npm run build:pages && npm run deploy:pages"
echo "  URL: https://duncan882022.github.io/Vifence/"
echo "  API vẫn trên Contabo: scripts/deploy-backend-contabo.sh"
exit 1
