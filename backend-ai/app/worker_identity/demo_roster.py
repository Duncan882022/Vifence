"""Gán công nhân demo theo track ổn định khi chưa có ảnh gallery."""

from __future__ import annotations

import hashlib

from .gallery import registry_rows
from .models import WorkerMatch

_DEMO_CAMERAS = frozenset({"A-04", "MOB-01", "MOB-02"})

_A04_SMOKING_DEMO = WorkerMatch(
    worker_id="w-021",
    worker_name="Phạm Quang Tùng",
    employee_code="VCS112233",
    contractor_name="Vincons",
    confidence=0.88,
    match_source="smoking_demo",
)


def demo_smoking_match(camera_id: str) -> WorkerMatch | None:
    """Nhân vật hút thuốc demo Cam A-04 — fallback khi gallery chưa khớp."""
    if camera_id != "A-04":
        return None
    return _A04_SMOKING_DEMO


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
