"""Luồng hành vi — touch_object song song, không phụ thuộc nhánh mặt."""

from __future__ import annotations

from .types import InteractionRecord, ObservationInput, TrackSession


def process_behavior(session: TrackSession, obs: ObservationInput) -> None:
    """Ghi tương tác vật thể vào buffer session (dedupe liên tiếp)."""
    obj_id = (obs.touched_object_id or "").strip()
    if not obj_id:
        return
    if session.interactions:
        last = session.interactions[-1]
        if last.object_id == obj_id and (obs.ts - last.timestamp) < 2.0:
            last.timestamp = obs.ts
            session.dirty = True
            return
    session.interactions.append(
        InteractionRecord(object_id=obj_id, action="touch", timestamp=obs.ts),
    )
    session.dirty = True
