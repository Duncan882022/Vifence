"""Khóa dedup sự kiện — giữ lần đầu, refresh snapshot trong cửa sổ."""

from __future__ import annotations

import logging
import time
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .schemas import ViolationEvent

logger = logging.getLogger("event_dedup")


def build_dedup_key(camera_id: str, scenario_id: str, track_id: str) -> str:
    """Khóa duy nhất: camera × kịch bản × đối tượng theo dõi."""
    base = f"{camera_id}|{scenario_id}|{track_id}"
    from .config import settings

    if not settings.event_dedup_enabled():
        from .vms_loop_state import loops_completed

        loop_n = loops_completed(camera_id)
        if loop_n > 0:
            return f"{base}|L{loop_n}"
    return base


class EventDedupRegistry:
    """Theo dõi lần đầu theo dedup_key — cửa sổ mặc định 3 giờ."""

    def __init__(self, window_seconds: float = 10800.0):
        self.window_seconds = window_seconds
        # dedup_key → created_at lần đầu trong cửa sổ hiện tại
        self._first_logged_at: dict[str, float] = {}

    def load_from_events(self, events: list[ViolationEvent]) -> None:
        for event in events:
            key = event.dedup_key
            if not key:
                continue
            prev = self._first_logged_at.get(key)
            if prev is None or event.created_at < prev:
                self._first_logged_at[key] = event.created_at

    def first_seen_at(self, dedup_key: str) -> float | None:
        return self._first_logged_at.get(dedup_key)

    def should_skip(self, dedup_key: str, now: float | None = None) -> bool:
        """True nếu đã có lần đầu trong cửa sổ — caller refresh snapshot, không tạo event mới."""
        ts = now if now is not None else time.time()
        first = self._first_logged_at.get(dedup_key)
        if first is None:
            return False
        age = ts - first
        if age < self.window_seconds:
            logger.info(
                "Trong cửa sổ lần đầu dedup_key=%s (%.0fs / %.0fs) — giữ giờ, refresh snapshot",
                dedup_key,
                age,
                self.window_seconds,
            )
            return True
        return False

    def register(self, dedup_key: str, created_at: float, *, replace: bool = False) -> None:
        """Ghi nhận lần đầu. replace=True khi mở cửa sổ mới (sau khi hết window)."""
        if replace or dedup_key not in self._first_logged_at:
            self._first_logged_at[dedup_key] = created_at
            return
        self._first_logged_at[dedup_key] = min(self._first_logged_at[dedup_key], created_at)

    def clear(self) -> int:
        """Xóa toàn bộ khóa dedup trong RAM — dùng khi DELETE /events."""
        count = len(self._first_logged_at)
        self._first_logged_at.clear()
        return count


def dedupe_events_by_key(
    events: list[ViolationEvent],
    *,
    window_seconds: float = 10800.0,
) -> list[ViolationEvent]:
    """Gom trùng trong cùng cửa sổ — giữ bản đầu; sau cửa sổ giữ event mới."""
    by_key: dict[str, list[ViolationEvent]] = {}
    for event in events:
        key = event.dedup_key or event.id
        by_key.setdefault(key, []).append(event)

    out: list[ViolationEvent] = []
    for group in by_key.values():
        group.sort(key=lambda e: e.created_at)
        kept: list[ViolationEvent] = []
        for event in group:
            if not kept or (event.created_at - kept[-1].created_at) >= window_seconds:
                kept.append(event)
        out.extend(kept)
    return out
