#!/usr/bin/env bash
# Ghép ttdv-a-cam03-test.mp4 — 5s đầu ảnh mesh (lỗ đen + vết bẩn) + body hiện tại.
#
# Manifest:
#   0–5s   mesh  — public/camera-feeds/cam03-mesh-demo.jpg
#   5–20s  body  — ttdv-a-cam03-test.pre-mesh-body.mp4 (640×640 @ 24fps)
#
# Usage: ./scripts/build-cam03-test-mp4.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${ROOT}/public/camera-feeds"
DOCS_DIR="${ROOT}/docs/camera-feeds"
TMP="${TMPDIR:-/tmp}/vifence-cam03-build"
W=640
H=640
FPS=24
MESH_SEC=5
MESH_IMG="${OUT_DIR}/cam03-mesh-demo.jpg"
BODY="${OUT_DIR}/ttdv-a-cam03-test.pre-mesh-body.mp4"
OUT="${OUT_DIR}/ttdv-a-cam03-test.mp4"

mkdir -p "$TMP" "$OUT_DIR" "$DOCS_DIR"

if [[ ! -f "$MESH_IMG" ]]; then
  echo "✗ Thiếu ${MESH_IMG} — thêm ảnh mesh demo trước."
  exit 1
fi

if [[ ! -f "$BODY" ]]; then
  if [[ -f "$OUT" ]]; then
    echo "→ Backup body → ttdv-a-cam03-test.pre-mesh-body.mp4"
    cp "$OUT" "$BODY"
  else
    echo "✗ Thiếu body MP4 (${BODY} hoặc ${OUT})."
    exit 1
  fi
fi

img_to_clip() {
  local src="$1" dst="$2" dur="$3"
  ffmpeg -y -loglevel error \
    -loop 1 -framerate "$FPS" -t "$dur" -i "$src" \
    -vf "scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},format=yuv420p" \
    -c:v libx264 -pix_fmt yuv420p -r "$FPS" \
    "$dst"
}

echo "→ Mesh intro 0–${MESH_SEC}s (cam03-mesh-demo.jpg)…"
img_to_clip "$MESH_IMG" "${TMP}/mesh_intro.mp4" "$MESH_SEC"

echo "→ Re-encode body ${MESH_SEC}s+ (640×640 @ ${FPS}fps)…"
ffmpeg -y -loglevel error -i "$BODY" \
  -vf "scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},format=yuv420p" \
  -c:v libx264 -pix_fmt yuv420p -r "$FPS" \
  "${TMP}/body.mp4"

cat > "${TMP}/concat.txt" <<EOF
file 'mesh_intro.mp4'
file 'body.mp4'
EOF

echo "→ Concat → ttdv-a-cam03-test.mp4…"
ffmpeg -y -loglevel error -f concat -safe 0 -i "${TMP}/concat.txt" \
  -c copy "$OUT"

cp "$OUT" "${DOCS_DIR}/ttdv-a-cam03-test.mp4"

DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT")
echo ""
echo "✓ ${OUT} (${DUR}s, ${W}×${H}, ${FPS}fps)"
echo "  0–${MESH_SEC}s mesh (BPTC-001) · ${MESH_SEC}s+ body cũ"
