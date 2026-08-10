#!/usr/bin/env bash
# GitHub Pages SPA fallback — redirect /Vifence/module03 → /Vifence/?/module03
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_STAMP="$(date -u +"%Y-%m-%dT%H:%MZ")"

cat > "$ROOT/docs/404.html" <<'EOF'
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

# Tránh CDN/browser giữ index.html cũ trỏ bundle đã xóa
INDEX="$ROOT/docs/index.html"
if [[ -f "$INDEX" ]]; then
  python3 - "$INDEX" "$BUILD_STAMP" <<'PY'
import sys
from pathlib import Path
path = Path(sys.argv[1])
stamp = sys.argv[2]
html = path.read_text(encoding="utf-8")
meta = (
    f'    <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate" />\n'
    f'    <meta name="vifence-build" content="{stamp}" />\n'
)
if 'name="vifence-build"' not in html:
    html = html.replace('<meta charset="UTF-8" />', '<meta charset="UTF-8" />\n' + meta, 1)
else:
    import re
    html = re.sub(r'<meta name="vifence-build" content="[^"]*" />', f'<meta name="vifence-build" content="{stamp}" />', html)
path.write_text(html, encoding="utf-8")
PY
fi
