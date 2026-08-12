#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

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
    echo "✗ Pre-deploy audit FAIL — sửa trước khi build Pages."
    exit 1
  }
else
  echo "⚠ Bỏ qua audit — chưa có backend-ai/.venv"
fi

echo "→ Build GitHub Pages…"
npm run build:pages

echo "→ Commit docs/ lên main (nếu có thay đổi)…"
git add docs/
if git diff --staged --quiet; then
  echo "   docs/ không đổi"
else
  git commit -m "chore(pages): cập nhật build docs"
fi

echo "→ Push main (GitHub Actions deploy nhánh gh-pages — một nguồn duy nhất)…"
git push origin main

echo ""
echo "✓ Build + push main xong."
echo "  GitHub Actions sẽ deploy gh-pages trong ~2–3 phút."
echo "  GitHub Pages:  https://duncan882022.github.io/Vifence/"
echo ""
echo "Nếu console báo 404 asset JS/CSS:"
echo "  • Hard refresh (Cmd+Shift+R) — tránh index.html cache trỏ hash cũ"
echo "  • Settings → Pages → Deploy from branch → gh-pages / (root)"
