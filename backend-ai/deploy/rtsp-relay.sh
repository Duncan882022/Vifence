#!/usr/bin/env bash
#
# Relay RTSP nguồn ngoài vào MediaMTX, chuẩn hoá timestamp.
#
# Vì sao cần lớp trung gian thay vì `source: rtsp://...` của MediaMTX:
#
#   1. Gateway bodycam gửi DTS nhảy lùi (`DTS is not monotonically increasing`)
#      khoảng 35 giây một lần. Muxer HLS chết theo, playlist trả 404 và trình
#      phát phải khởi tạo lại — đúng cú khựng người xem thấy.
#      `-use_wallclock_as_timestamps 1` dựng lại mốc thời gian theo đồng hồ máy.
#
#   2. Track AAC đi kèm không dùng vào việc gì mà lại là nguồn lỗi DTS riêng.
#      `-an` bỏ hẳn.
#
# `-c:v copy` nên KHÔNG encode lại: hình giữ nguyên chất lượng gốc, CPU không đáng kể.
#
# Script tự ngủ trước khi thoát để `runOnInitRestart: yes` của MediaMTX không
# quay vòng liên tục khi nguồn đang tắt — không có nó thì mũ tắt cả buổi sẽ sinh
# hàng nghìn lần bắt tay RTSP mỗi giờ.
#
# Dùng: rtsp-relay.sh <src-rtsp> <dst-rtsp> [backoff-giây]

set -u

SRC="${1:?thiếu URL nguồn}"
DST="${2:?thiếu URL đích}"
BACKOFF="${3:-8}"

ffmpeg -hide_banner -loglevel warning \
  -rtsp_transport tcp \
  -use_wallclock_as_timestamps 1 \
  -i "$SRC" \
  -an -c:v copy \
  -f rtsp -rtsp_transport tcp "$DST" || true

# Nguồn chưa lên thì đợi rồi mới để MediaMTX gọi lại.
sleep "$BACKOFF"
