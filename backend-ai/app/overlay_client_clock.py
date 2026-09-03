"""Đồng hồ khung hình của người xem — dùng để chọn overlay đúng khung.

FE báo lên wallclock của khung hình nó đang chiếu (lấy từ
EXT-X-PROGRAM-DATE-TIME). Báo mỗi frame thì tốn kết nối vô ích, nên FE chỉ gửi
thưa và backend tự cộng thời gian trôi qua: video chạy 1x nên mốc hiển thị tiến
đều đúng bằng thời gian thực.

Mốc quá cũ (FE ngưng gửi vì đổi tab, tua, hoặc mất mạng) bị bỏ — thà trả overlay
mới nhất và nói rõ là chưa khớp, còn hơn suy diễn từ một mốc đã trôi xa.
"""

from __future__ import annotations

import time

# Không nhận được mốc mới quá lâu thì coi như FE đã ngừng đồng bộ.
CLIENT_CLOCK_STALE_SEC = 6.0
# Chênh lệch tối đa cho phép giữa mốc FE báo và giờ máy chủ. Vượt ngưỡng này gần
# như chắc chắn là đồng hồ máy khách sai, không phải độ trễ buffer.
CLIENT_CLOCK_MAX_OFFSET_SEC = 120.0


class DetectionsClientClock:
    """Mốc hiển thị gần nhất FE báo lên, ngoại suy theo thời gian trôi qua."""

    def __init__(self) -> None:
        self._reported_ms: float | None = None
        self._received_at: float = 0.0

    def update(self, at_ms: object, *, now: float | None = None) -> bool:
        """Ghi nhận mốc mới. Trả False khi giá trị không dùng được."""
        ts = now if now is not None else time.time()

        if at_ms is None:
            self._reported_ms = None
            self._received_at = 0.0
            return True

        if isinstance(at_ms, bool) or not isinstance(at_ms, (int, float)):
            return False
        value = float(at_ms)
        if value <= 0:
            return False
        if abs(value - ts * 1000.0) > CLIENT_CLOCK_MAX_OFFSET_SEC * 1000.0:
            return False

        self._reported_ms = value
        self._received_at = ts
        return True

    def display_wallclock_ms(self, now: float | None = None) -> float | None:
        """Mốc khung hình FE đang chiếu ngay lúc này, hoặc None khi chưa rõ."""
        if self._reported_ms is None:
            return None
        ts = now if now is not None else time.time()
        elapsed = ts - self._received_at
        if elapsed < 0 or elapsed > CLIENT_CLOCK_STALE_SEC:
            return None
        return self._reported_ms + elapsed * 1000.0
