#!/usr/bin/env bash
# Đo độ trễ từ lúc mũ lên sóng tới lúc backend có detections (ROI).
#
# Phát một MP4 vào path helmet trên MediaMTX rồi poll /stream/<ID>/detections,
# lặp nhiều vòng phát–tắt để bắt cả trường hợp phát lại sau khi mất sóng.
#
# Usage: bash scripts/measure-helmet-pickup.sh [cycles]
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
API="${API:-https://217.217.253.247.nip.io}"
RTSP="${RTSP:-rtsp://217.217.253.247:8554/hc-02}"
CAMERA="${CAMERA:-HC-02}"
CLIP="${CLIP:-$ROOT/public/camera-feeds/yard-builders.mp4}"
CYCLES="${1:-3}"

ready() {
  curl -sk -m 3 "$API/stream/$CAMERA/detections" 2>/dev/null | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    print('READY' if d['vms_ready'] and d['stream_online'] else 'wait')
except Exception:
    print('wait')
"
}

for cycle in $(seq 1 "$CYCLES"); do
  ffmpeg -hide_banner -loglevel error -re -stream_loop -1 -i "$CLIP" \
    -an -c:v libx264 -preset veryfast -g 30 -b:v 1500k \
    -f rtsp -rtsp_transport tcp "$RTSP" &
  publisher=$!
  start="$(date +%s.%N)"

  elapsed="timeout"
  for _ in $(seq 1 80); do
    if [[ "$(ready)" == "READY" ]]; then
      elapsed="$(python3 -c "print(f'{$(date +%s.%N) - $start:.1f}s')")"
      break
    fi
    sleep 0.25
  done
  echo "vòng $cycle: ROI sẵn sàng sau $elapsed"

  kill "$publisher" 2>/dev/null
  wait "$publisher" 2>/dev/null
  sleep 12
done
