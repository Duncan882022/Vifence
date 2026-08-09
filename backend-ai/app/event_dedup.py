"""Khóa dedup sự kiện — tránh log trùng khi theo dõi phạt."""

from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .schemas import ViolationEvent

logger = logging.getLogger("event_dedup")


def build_dedup_key(camera_id: str, scenario_id: str, track_id: str) -> str:
    """Khóa duy nhất: camera × kịch bản × đối tượng theo dõi."""
    return f"{camera_id}|{scenario_id}|{track_id}"


class EventDedupRegistry:
    """Chặn ghi trùng nhanh + hỗ trợ dedup khi đọc JSONL."""

    def __init__(self, rapid_window_seconds: float = 45.0):
        self.rapid_window_seconds = rapid_window_seconds
        self._last_logged_at: dict[str, float] = {}

    def load_from_events(self, events: list[ViolationEvent]) -> None:
        for event in events:
            key = event.dedup_key
            if not key:
                continue
            prev = self._last_logged_at.get(key, 0.0)
            self._last_logged_at[key] = max(prev, event.created_at)

    def should_skip(self, dedup_key: str, now: float | None = None) -> bool:
        ts = now if now is not None else time.time()
        last = self._last_logged_at.get(dedup_key)
        if last is None:
            return False
        if ts - last < self.rapid_window_seconds:
            logger.info(
                "Bỏ qua log trùng dedup_key=%s (%.1fs < %.1fs)",
                dedup_key,
                ts - last,
                self.rapid_window_seconds,
            )
            return True
        return False

    def register(self, dedup_key: str, created_at: float) -> None:
        prev = self._last_logged_at.get(dedup_key, 0.0)
        self._last_logged_at[dedup_key] = max(prev, created_at)


def dedupe_events_by_key(events: list[ViolationEvent]) -> list[ViolationEvent]:
    """Giữ bản mới nhất theo dedup_key (fallback id)."""
    best: dict[str, ViolationEvent] = {}
    for event in events:
        key = event.dedup_key or event.id
        prev = best.get(key)
        if prev is None or event.created_at >= prev.created_at:
            best[key] = event
    return list(best.values())
