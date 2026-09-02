"""In-memory session store — một nguồn sự thật cho ptk-* → identity."""

from __future__ import annotations

import threading
import uuid

from . import lost_track_memory
from .types import TrackSession

_lock = threading.RLock()
_sessions: dict[str, TrackSession] = {}
PARALLEL_BBOX_IOU_MIN = 0.08


def _new_session_id(camera_id: str, track_id: str) -> str:
    short = uuid.uuid4().hex[:10]
    return f"sess-{camera_id}-{short}"


def get_session(camera_id: str, track_id: str) -> TrackSession | None:
    key = f"{camera_id}|{track_id}"
    with _lock:
        return _sessions.get(key)


def get_or_create(
    camera_id: str,
    track_id: str,
    *,
    ts: float,
    zone_id: str | None = None,
    bbox: tuple[float, float, float, float] | None = None,
    face_embedding: tuple[float, ...] | None = None,
) -> TrackSession:
    key = f"{camera_id}|{track_id}"
    with _lock:
        existing = _sessions.get(key)
        if existing is not None:
            return existing

        session = TrackSession(
            camera_id=camera_id,
            track_id=track_id,
            zone_id=zone_id,
            started_at=ts,
            last_seen_at=ts,
            bbox=bbox,
            session_id=_new_session_id(camera_id, track_id),
        )

        reclaimed = lost_track_memory.try_reclaim(
            camera_id,
            bbox=bbox,
            embedding=face_embedding,
            now=ts,
        )
        if reclaimed is not None:
            lost_track_memory.apply_reclaim(session, reclaimed, now=ts)
            if session.started_at > ts:
                session.started_at = ts

        _sessions[key] = session
        return session


def pop_session(camera_id: str, track_id: str) -> TrackSession | None:
    key = f"{camera_id}|{track_id}"
    with _lock:
        return _sessions.pop(key, None)


def reset(camera_id: str | None = None) -> None:
    lost_track_memory.reset(camera_id)
    with _lock:
        if camera_id is None:
            _sessions.clear()
            return
        prefix = f"{camera_id}|"
        for k in [k for k in _sessions if k.startswith(prefix)]:
            _sessions.pop(k, None)


def all_sessions() -> list[TrackSession]:
    with _lock:
        return list(_sessions.values())


def _bbox_iou(
    a: tuple[float, float, float, float],
    b: tuple[float, float, float, float],
) -> float:
    ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
    ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0
    inter = (ix2 - ix1) * (iy2 - iy1)
    area_a = max(0.0, a[2] - a[0]) * max(0.0, a[3] - a[1])
    area_b = max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def _bbox_parallel_track_proximity(
    a: tuple[float, float, float, float],
    b: tuple[float, float, float, float],
) -> bool:
    """Hai track ByteTrack cùng một người — gần nhau theo cả X lẫn Y, không chỉ cùng hàng."""
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    acx, acy = (ax1 + ax2) / 2.0, (ay1 + ay2) / 2.0
    bcx, bcy = (bx1 + bx2) / 2.0, (by1 + by2) / 2.0
    aw, ah = max(ax2 - ax1, 1.0), max(ay2 - ay1, 1.0)
    bw, bh = max(bx2 - bx1, 1.0), max(by2 - by1, 1.0)
    min_w, min_h = min(aw, bw), min(ah, bh)
    return abs(acx - bcx) <= min_w * 0.55 and abs(acy - bcy) <= min_h * 0.55


def borrow_parallel_object_subject(
    camera_id: str,
    started_at: float,
    now_ts: float,
    bbox: tuple[float, float, float, float] | None = None,
) -> str | None:
    """Track mới cùng camera + bbox chồng (cùng người) → dùng lại obj-*."""
    from .. import daystore

    prefix = f"{camera_id}|"
    with _lock:
        best: str | None = None
        best_last = 0.0
        for key, other in _sessions.items():
            if not key.startswith(prefix):
                continue
            oid = (other.subject_id or "").strip()
            if not oid.startswith("obj-"):
                continue
            if abs(other.started_at - started_at) > daystore.PARALLEL_OBJ_START_MAX_SEC:
                continue
            if now_ts - other.last_seen_at > daystore.PARALLEL_OBJ_ACTIVE_SEC:
                continue
            if bbox is not None and other.bbox is not None:
                iou = _bbox_iou(bbox, other.bbox)
                if iou < PARALLEL_BBOX_IOU_MIN and not _bbox_parallel_track_proximity(bbox, other.bbox):
                    continue
            if other.last_seen_at >= best_last:
                best_last = other.last_seen_at
                best = oid
        return best


def borrow_overlapping_person_subject(
    camera_id: str,
    now_ts: float,
    bbox: tuple[float, float, float, float] | None = None,
) -> str | None:
    """Track mới overlap người đã có pers/tk — tránh tạo thêm obj-*."""
    from .. import daystore
    from ...patrol_ids import is_person_subject_id

    prefix = f"{camera_id}|"
    with _lock:
        best: str | None = None
        best_last = 0.0
        for _key, other in _sessions.items():
            if not _key.startswith(prefix):
                continue
            sid = (other.subject_id or "").strip()
            if not sid or sid.startswith("obj-") or not is_person_subject_id(sid):
                continue
            if now_ts - other.last_seen_at > daystore.PARALLEL_OBJ_ACTIVE_SEC:
                continue
            if bbox is not None and other.bbox is not None:
                iou = _bbox_iou(bbox, other.bbox)
                if iou < PARALLEL_BBOX_IOU_MIN and not _bbox_parallel_track_proximity(bbox, other.bbox):
                    continue
            if other.last_seen_at >= best_last:
                best_last = other.last_seen_at
                best = sid
        return best


def link_subject_session(session: TrackSession) -> None:
    """Cùng tk-* / pers-* / obj-* + camera — gộp appearance (YOLO tách 2 track một người)."""
    subject_id = (session.subject_id or "").strip()
    if not subject_id:
        return
    from ...patrol_ids import is_person_subject_id

    if not (subject_id.startswith("obj-") or is_person_subject_id(subject_id)):
        return
    with _lock:
        for other in _sessions.values():
            if other is session or other.camera_id != session.camera_id:
                continue
            if (other.subject_id or "").strip() != subject_id:
                continue
            if other.appearance_row_id is None:
                continue
            session.appearance_row_id = other.appearance_row_id
            session.luot_snapshot_captured = other.luot_snapshot_captured
            session.session_id = other.session_id
            if other.committed:
                session.committed = True
                session.last_flush_at = max(session.last_flush_at, other.last_flush_at)
            return


def session_keys_for_camera(camera_id: str) -> list[str]:
    prefix = f"{camera_id}|"
    with _lock:
        return [k for k in _sessions if k.startswith(prefix)]


def pop_all_sessions(camera_id: str) -> list[TrackSession]:
    prefix = f"{camera_id}|"
    with _lock:
        keys = [k for k in _sessions if k.startswith(prefix)]
        return [_sessions.pop(k) for k in keys]
