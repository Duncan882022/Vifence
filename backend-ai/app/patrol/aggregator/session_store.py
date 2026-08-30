"""In-memory session store — một nguồn sự thật cho ptk-* → identity."""

from __future__ import annotations

import threading

from .types import TrackSession

_lock = threading.RLock()
_sessions: dict[str, TrackSession] = {}


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
        )
        _sessions[key] = session
        return session


def pop_session(camera_id: str, track_id: str) -> TrackSession | None:
    key = f"{camera_id}|{track_id}"
    with _lock:
        return _sessions.pop(key, None)


def reset(camera_id: str | None = None) -> None:
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
