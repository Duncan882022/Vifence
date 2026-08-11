#!/usr/bin/env bash
# Ghép ttdv-a-cam04-test.mp4 CHỈ từ ảnh demo đã gắn nhãn (không cắt YouTube / clip lạ).
#
# Nguồn (manifest):
#   0–10s  crane  — backend-ai/data/cam04_demo/0355|0359|0360.png
#   10–15s PPE    — public/camera-feeds/cam04-ppe-workers.jpg
#   15–20s PCCC   — public/camera-feeds/cam04-pccc-scene.jpg
#   20–25s WAH    — public/camera-feeds/cam04-wah-scene.jpg
#
# Usage: ./scripts/build-cam04-test-mp4.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${ROOT}/public/camera-feeds"
DOCS_DIR="${ROOT}/docs/camera-feeds"
TMP="${TMPDIR:-/tmp}/vifence-cam04-build"
W=1024
H=976
FPS=25

DEMO="${ROOT}/backend-ai/data/cam04_demo"
FEEDS="${ROOT}/public/camera-feeds"

mkdir -p "$TMP" "$OUT_DIR" "$DOCS_DIR"

img_to_clip() {
  local src="$1" dst="$2" dur="$3"
  ffmpeg -y -loglevel error \
    -loop 1 -framerate "$FPS" -t "$dur" -i "$src" \
    -vf "scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,format=yuv420p" \
    -c:v libx264 -pix_fmt yuv420p -r "$FPS" \
    "$dst"
}

echo "→ Crane 0–10s (3 ảnh demo 0355/0359/0360)…"
img_to_clip "${DEMO}/0355.png" "${TMP}/crane_0355.mp4" 3.5
img_to_clip "${DEMO}/0359.png" "${TMP}/crane_0359.mp4" 3.5
img_to_clip "${DEMO}/0360.png" "${TMP}/crane_0360.mp4" 3.0

echo "→ PPE 10–15s…"
img_to_clip "${FEEDS}/cam04-ppe-workers.jpg" "${TMP}/ppe.mp4" 5.0

echo "→ PCCC 15–20s…"
img_to_clip "${FEEDS}/cam04-pccc-scene.jpg" "${TMP}/pccc.mp4" 5.0

echo "→ WAH 20–25s…"
img_to_clip "${FEEDS}/cam04-wah-scene.jpg" "${TMP}/wah.mp4" 5.0

cat > "${TMP}/concat.txt" <<EOF
file 'crane_0355.mp4'
file 'crane_0359.mp4'
file 'crane_0360.mp4'
file 'ppe.mp4'
file 'pccc.mp4'
file 'wah.mp4'
EOF

echo "→ Concat → ttdv-a-cam04-test.mp4…"
ffmpeg -y -loglevel error -f concat -safe 0 -i "${TMP}/concat.txt" \
  -c copy "${OUT_DIR}/ttdv-a-cam04-test.mp4"

cp "${OUT_DIR}/ttdv-a-cam04-test.mp4" "${DOCS_DIR}/ttdv-a-cam04-test.mp4"

DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "${OUT_DIR}/ttdv-a-cam04-test.mp4")
echo ""
echo "✓ ${OUT_DIR}/ttdv-a-cam04-test.mp4 (${DUR}s, ${W}×${H}, ${FPS}fps)"
echo "  Nguồn: cam04_demo PNG + cam04-{ppe,pccc,wah}-scene.jpg"
