#!/usr/bin/env bash
# GitHub Pages SPA fallback — redirect /Vifence/module03 → /Vifence/?/module03
# + copy index.html vào các deep-link folder để giảm 404 console khi mở /module05
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOCS="${ROOT}/docs"

# Jekyll bỏ qua thư mục _* và có thể phá asset Vite — bắt buộc cho GitHub Pages.
touch "${DOCS}/.nojekyll"

cat > "${DOCS}/404.html" <<'EOF'
<!DOCTYPE html>
<html lang="vi">
  <head>
    <meta charset="utf-8" />
    <title>Vifence CMS</title>
    <script type="text/javascript">
      var pathSegmentsToKeep = 1;
      var l = window.location;
      l.replace(
        l.protocol + '//' + l.hostname + (l.port ? ':' + l.port : '') +
        l.pathname.split('/').slice(0, 1 + pathSegmentsToKeep).join('/') + '/?/' +
        l.pathname.slice(1).split('/').slice(pathSegmentsToKeep).join('/').replace(/&/g, '~and~') +
        (l.search ? '&' + l.search.slice(1).replace(/&/g, '~and~') : '') +
        l.hash
      );
    </script>
  </head>
  <body></body>
</html>
EOF

# Deep-link folders: /Vifence/module05/ → 200 + cùng SPA (không spam 404 trong console)
if [[ -f "${DOCS}/index.html" ]]; then
  for route in module01 module03 module04 module05 module06 module07 module08 dttt equipment profile scanner phat-song; do
    mkdir -p "${DOCS}/${route}"
    cp "${DOCS}/index.html" "${DOCS}/${route}/index.html"
  done
  # Module 05 sub-routes (hồ sơ / quét mặt)
  for route in module05/ho-so module05/quet-mat; do
    mkdir -p "${DOCS}/${route}"
    cp "${DOCS}/index.html" "${DOCS}/${route}/index.html"
  done
fi
