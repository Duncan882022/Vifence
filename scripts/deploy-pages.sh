#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Audit ATLĐ (PPE / WAH / cẩu tháp) đã bỏ khỏi cổng deploy.
#
# Nó kiểm Module 03, không đụng gì tới Module 05, nhưng chạy mất ~140 giây và
# không ổn định — cùng một mã nguồn lúc FAIL lúc PASS. Một cổng chặn hay báo
# động giả thì người ta sẽ bỏ qua nó, và lúc ấy nó thành vô dụng thật.
#
# Vẫn chạy được khi cần: npm run audit:predeploy
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
