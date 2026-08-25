"""Xác minh nhận diện công nhân — chỉ gắn tên khi khớp mặt gallery thật."""

from __future__ import annotations

from . import face_thresholds
from .models import WorkerMatch

# Chỉ mũ/áo gắn danh tính — giày (PPE-003) không đủ căn cứ nhận diện mặt.
PPE_IDENTITY_BEHAVIORS = frozenset({"no_helmet", "no_vest"})


def is_verified_face_match(match: WorkerMatch, camera_id: str = "") -> bool:
    return (
        match.worker_id != "unknown"
        and match.match_source == "face"
        and match.confidence >= face_thresholds.gallery_min_confidence(camera_id)
    )


def worker_match_from_detection(det: object) -> WorkerMatch:
    return WorkerMatch(
        worker_id=str(getattr(det, "worker_id", None) or "unknown"),
        worker_name=str(getattr(det, "worker_name", None) or ""),
        employee_code=str(getattr(det, "employee_code", None) or ""),
        contractor_name=getattr(det, "contractor_name", None),
        confidence=float(getattr(det, "face_match_confidence", None) or 0.0),
        match_source=str(getattr(det, "face_match_source", None) or "unknown"),
    )
