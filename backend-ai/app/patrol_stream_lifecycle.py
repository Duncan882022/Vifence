"""Chốt track/session tuần tra khi stream ngắt — ended_at = frame cuối."""

from __future__ import annotations

import logging
import threading
import time

logger = logging.getLogger("patrol.stream_lifecycle")

_lock = threading.RLock()
_offline_finalized: dict[str, float] = {}


def on_patrol_stream_offline(camera_id: str, *, at_ts: float) -> int:
    """Finalize mọi track/session khi cam tắt hoặc frame stale.

    `at_ts` = wallclock frame cuối (không phải lúc bật lại).
    Trả số track đã chốt.
    """
    cid = (camera_id or "").strip()
    if not cid:
        return 0
    ts = float(at_ts)
    if ts <= 0:
        ts = time.time()

    with _lock:
        prev = _offline_finalized.get(cid)
        if prev is not None and abs(prev - ts) < 0.5:
            return 0
        _offline_finalized[cid] = ts

    from .patrol.aggregator.engine import finalize_orphan_sessions
    from .patrol.sink import forget_track
    from .patrol_tracker import get_patrol_tracker, is_patrol_tracker_camera

    # Session aggregator còn sót khi ByteTrack đã drop track trước lúc stream ngắt.
    closed = finalize_orphan_sessions(cid)

    if not is_patrol_tracker_camera(cid):
        if closed:
            logger.info(
                "patrol stream offline %s — finalized %d session(s) at ts=%.3f",
                cid,
                closed,
                ts,
            )
        return closed

    tracker = get_patrol_tracker(cid)
    for track_id, track in list(tracker.tracks.items()):
        end_ts = float(track.last_measured_at) if track.last_measured_at > 0 else ts
        tracker.tracks.pop(track_id, None)
        try:
            forget_track(cid, track_id, now=end_ts)
            closed += 1
        except Exception:  # noqa: BLE001
            logger.debug("forget_track offline %s %s", cid, track_id, exc_info=True)

    closed += finalize_orphan_sessions(cid)
    if closed:
        logger.info(
            "patrol stream offline %s — finalized %d track(s) at ts=%.3f",
            cid,
            closed,
            ts,
        )
    return closed


def reset_patrol_stream_lifecycle(camera_id: str | None = None) -> None:
    with _lock:
        if camera_id is None:
            _offline_finalized.clear()
            return
        _offline_finalized.pop(camera_id.strip(), None)


def mark_patrol_stream_online(camera_id: str) -> None:
    """Frame mới — cho phép finalize lại ở lần offline kế tiếp."""
    reset_patrol_stream_lifecycle(camera_id)
