"""Serialize TrackSession → JSON chuẩn yêu cầu."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from .types import TrackSession


def _iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


def build_event_payload(
    session: TrackSession,
    *,
    tier_at_observation: str | None = None,
) -> dict[str, Any]:
    event_id = f"evt-{session.camera_id}-{session.track_id}-{int(session.started_at)}"
    payload: dict[str, Any] = {
        "event_id": event_id,
        "track_id": session.track_id,
        "session_id": session.session_id or "",
        "counted": bool(session.counted),
        "person_identity": session.identity.to_dict(),
        "interactions": [i.to_dict() for i in session.interactions],
        "appearance_span": {
            "start_time": _iso(session.started_at),
            "end_time": _iso(session.last_seen_at),
            "duration_seconds": int(round(session.duration_seconds)),
        },
    }
    tier = (tier_at_observation or "").strip()
    if tier:
        payload["tier_at_observation"] = tier
    return payload
