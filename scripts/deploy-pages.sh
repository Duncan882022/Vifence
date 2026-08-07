#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "→ Build GitHub Pages…"
npm run build:pages

echo "→ Commit docs/ lên main (nếu có thay đổi)…"
git add docs/
if git diff --staged --quiet; then
  echo "   docs/ không đổi"
else
  git commit -m "chore(pages): cập nhật build docs"
fi

echo "→ Push nhánh gh-pages…"
TMP_BRANCH="tmp-gh-pages-$(date +%s)"
git subtree split --prefix docs -b "$TMP_BRANCH"
git push origin "refs/heads/${TMP_BRANCH}:refs/heads/gh-pages" --force
git branch -D "$TMP_BRANCH"

echo "→ Push main…"
git push origin main

echo ""
echo "✓ Deploy xong."
echo "  Local preview: npm run preview:pages"
echo "  GitHub Pages:  https://duncan882022.github.io/Vifence/"
echo ""
echo "Nếu site vẫn cũ → Settings → Pages → Source:"
echo "  • GitHub Actions  HOẶC"
echo "  • Deploy from branch → gh-pages / (root)"
