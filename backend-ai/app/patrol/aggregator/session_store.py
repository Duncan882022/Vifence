"""In-memory session store — một nguồn sự thật cho ptk-* → identity."""

from __future__ import annotations

import threading
import uuid

from . import lost_track_memory
from .types import TrackSession

_lock = threading.RLock()
_sessions: dict[str, TrackSession] = {}


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
            lost_track_memory.apply_reclaim(session, reclaimed)
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


def link_subject_session(session: TrackSession) -> None:
    """Cùng pers-* + camera — gộp appearance (YOLO tách 2 track một người)."""
    subject_id = (session.subject_id or "").strip()
    if not subject_id:
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
            session.session_id = other.session_id
            if other.committed:
                session.committed = True
                session.last_flush_at = max(session.last_flush_at, other.last_flush_at)
            return
