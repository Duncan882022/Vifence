"""Theo dõi số vòng loop video VMS — dedup chỉ bật sau audit grace."""

from __future__ import annotations

import logging
import threading
from typing import Callable

logger = logging.getLogger("vms_loop_state")

_lock = threading.Lock()
_loop_counts: dict[str, int] = {}
_reset_handlers: list[Callable[[str], None]] = []


def register_reset_handler(handler: Callable[[str], None]) -> None:
    _reset_handlers.append(handler)


def register_video_loop(camera_id: str) -> int:
    """Gọi khi MP4 rewind EOF — tăng bộ đếm loop và reset debouncer engine."""
    with _lock:
        loop_n = _loop_counts.get(camera_id, 0) + 1
        _loop_counts[camera_id] = loop_n
    for handler in _reset_handlers:
        try:
            handler(camera_id)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Reset engine sau loop %s lỗi: %s", camera_id, exc)
    logger.info("[VMS %s] Video loop #%d — reset track/debouncer.", camera_id, loop_n)
    return loop_n


def min_loops_completed() -> int:
    with _lock:
        if not _loop_counts:
            return 0
        return min(_loop_counts.values())


def loops_completed(camera_id: str) -> int:
    with _lock:
        return _loop_counts.get(camera_id, 0)


def reset_all() -> None:
    """Xóa bộ đếm loop — dùng khi DELETE /events trước audit mới."""
    with _lock:
        _loop_counts.clear()
    logger.info("VMS loop counters đã reset.")
