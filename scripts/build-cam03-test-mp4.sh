#!/usr/bin/env bash
# Ghép ttdv-a-cam03-test.mp4 — manifest demo Cam A-03 (20s @ 640×640).
#
# Manifest:
#   0–5s    mesh       — public/camera-feeds/cam03-mesh-demo.jpg (BPTC-001)
#   5–12s   no-lane    — public/camera-feeds/cam03-atgt-no-lane-scene.jpg (ATGT-004)
#   12–20s  fence/ATGT — public/camera-feeds/cam03-atgt-scene.jpg (ATGT-002 + hàng rào)
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
NO_LANE_SEC=7
FENCE_SEC=8
MESH_IMG="${OUT_DIR}/cam03-mesh-demo.jpg"
NO_LANE_IMG="${OUT_DIR}/cam03-atgt-no-lane-scene.jpg"
FENCE_IMG="${OUT_DIR}/cam03-atgt-scene.jpg"
OUT="${OUT_DIR}/ttdv-a-cam03-test.mp4"

mkdir -p "$TMP" "$OUT_DIR" "$DOCS_DIR"

for f in "$MESH_IMG" "$NO_LANE_IMG" "$FENCE_IMG"; do
  if [[ ! -f "$f" ]]; then
    echo "✗ Thiếu ${f}"
    exit 1
  fi
done

img_to_clip() {
  local src="$1" dst="$2" dur="$3"
  ffmpeg -y -loglevel error \
    -loop 1 -framerate "$FPS" -t "$dur" -i "$src" \
    -vf "scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},format=yuv420p" \
    -c:v libx264 -pix_fmt yuv420p -r "$FPS" \
    "$dst"
}

echo "→ Mesh intro 0–${MESH_SEC}s…"
img_to_clip "$MESH_IMG" "${TMP}/mesh_intro.mp4" "$MESH_SEC"

echo "→ No-lane segment ${MESH_SEC}–$((MESH_SEC + NO_LANE_SEC))s…"
img_to_clip "$NO_LANE_IMG" "${TMP}/no_lane.mp4" "$NO_LANE_SEC"

echo "→ Fence/ATGT segment $((MESH_SEC + NO_LANE_SEC))–$((MESH_SEC + NO_LANE_SEC + FENCE_SEC))s…"
img_to_clip "$FENCE_IMG" "${TMP}/fence_atgt.mp4" "$FENCE_SEC"

cat > "${TMP}/concat.txt" <<EOF
file 'mesh_intro.mp4'
file 'no_lane.mp4'
file 'fence_atgt.mp4'
EOF

echo "→ Concat → ttdv-a-cam03-test.mp4…"
ffmpeg -y -loglevel error -f concat -safe 0 -i "${TMP}/concat.txt" \
  -c copy "$OUT"

cp "$OUT" "${DOCS_DIR}/ttdv-a-cam03-test.mp4"

DUR=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$OUT")
echo ""
echo "✓ ${OUT} (${DUR}s, ${W}×${H}, ${FPS}fps)"
echo "  0–${MESH_SEC}s mesh · ${MESH_SEC}–$((MESH_SEC + NO_LANE_SEC))s ATGT-004 · $((MESH_SEC + NO_LANE_SEC))s+ hàng rào/ATGT-002"
