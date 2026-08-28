#!/usr/bin/env bash
# Đồng bộ build SPA từ docs/ → repo root để GitHub Pages (main / root) không serve index dev.
# Settings → Pages trỏ nhầm main/(root) sẽ load /src/main.tsx → 404. Root phải có bản build thật.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOCS="${ROOT}/docs"

if [[ ! -f "${DOCS}/index.html" ]]; then
  echo "sync-pages-to-root: thiếu docs/index.html — chạy npm run build:pages trước" >&2
  exit 1
fi

echo "→ Sync docs/ → repo root (GitHub Pages main/root)…"

# Entry + SPA fallback
cp "${DOCS}/index.html" "${ROOT}/index.html"
cp "${DOCS}/404.html" "${ROOT}/404.html"
touch "${ROOT}/.nojekyll"

# Icons
for f in favicon.ico favicon.png apple-touch-icon.png logo-512.png; do
  [[ -f "${DOCS}/${f}" ]] && cp "${DOCS}/${f}" "${ROOT}/${f}"
done

# JS/CSS bundles — bắt buộc cho SPA
rm -rf "${ROOT}/assets"
cp -a "${DOCS}/assets" "${ROOT}/assets"

# Deep-link folders (HTML nhẹ, tránh 404 console khi mở /Vifence/module05/)
ROUTES=(
  module01 module03 module04 module05 module06 module07 module08
  dttt equipment profile scanner phat-song
  module05/ho-so module05/quet-mat
)
for route in "${ROUTES[@]}"; do
  mkdir -p "${ROOT}/${route}"
  cp "${DOCS}/index.html" "${ROOT}/${route}/index.html"
done

echo "   ✓ index.html + assets/ + route folders"
