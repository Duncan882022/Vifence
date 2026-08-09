"""Gán công nhân demo theo track ổn định khi chưa có ảnh gallery."""

from __future__ import annotations

import hashlib

from .gallery import registry_rows
from .models import WorkerMatch

_DEMO_CAMERAS = frozenset({"A-04", "MOB-01", "MOB-02"})


def demo_match_from_track(camera_id: str, track_id: str) -> WorkerMatch | None:
    if camera_id not in _DEMO_CAMERAS:
        return None
    rows = registry_rows()
    if not rows:
        return None
    slot = track_id.split(":")[0] if ":" in track_id else track_id
    digest = hashlib.md5(f"{camera_id}:{slot}".encode()).hexdigest()
    idx = int(digest[:8], 16) % len(rows)
    row = rows[idx]
    return WorkerMatch(
        worker_id=str(row["worker_id"]),
        worker_name=str(row["worker_name"]),
        employee_code=str(row["employee_code"]),
        contractor_name=row.get("contractor_name"),
        confidence=0.55,
        match_source="track_demo",
    )
