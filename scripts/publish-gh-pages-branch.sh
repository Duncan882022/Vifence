#!/usr/bin/env bash
# Đẩy thư mục docs/ lên nhánh gh-pages (fallback khi Pages source = branch).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOCS="${ROOT}/docs"

if [[ ! -f "${DOCS}/index.html" ]]; then
  echo "Thiếu ${DOCS}/index.html — chạy npm run build:pages trước." >&2
  exit 1
fi

WORK="${TMPDIR:-/tmp}/vifence-gh-pages-$$"
rm -rf "${WORK}"
mkdir -p "${WORK}"
rsync -a --delete "${DOCS}/" "${WORK}/"

cd "${WORK}"
git init -q
git checkout -b gh-pages
git add -A
git commit -q -m "Deploy Pages: $(date -u +%Y-%m-%dT%H:%MZ)"

REMOTE="${1:-${GITHUB_REPOSITORY:+https://github.com/${GITHUB_REPOSITORY}.git}}"
if [[ -z "${REMOTE}" ]]; then
  REMOTE="origin"
fi
git push -f "${REMOTE}" gh-pages:gh-pages
echo "✓ Đã push gh-pages → ${REMOTE}"
