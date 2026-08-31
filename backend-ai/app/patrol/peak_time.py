"""Peak time — đám đông trong khung: ưu tiên lượt gặp, mặt rõ mới định danh."""

from __future__ import annotations

import threading

from ..config import settings

_lock = threading.Lock()
_peak_active: dict[str, bool] = {}


def update_peak_time_density(camera_id: str, frame_person_count: int) -> bool:
    """Cập nhật trạng thái peak theo số silhouette/khung; trả peak hiện tại."""
    if not settings.patrol_peak_time_enabled:
        return False
    cam = (camera_id or "").strip()
    if not cam:
        return False
    enter = int(settings.patrol_peak_time_enter_count)
    exit_at = int(settings.patrol_peak_time_exit_count)
    with _lock:
        active = _peak_active.get(cam, False)
        if frame_person_count >= enter:
            active = True
        elif frame_person_count <= exit_at:
            active = False
        _peak_active[cam] = active
        return active


def is_peak_time(camera_id: str) -> bool:
    cam = (camera_id or "").strip()
    if not cam or not settings.patrol_peak_time_enabled:
        return False
    with _lock:
        return _peak_active.get(cam, False)


def peak_identity_allowed(
    *,
    face_eligible: bool,
    face_quality: float,
    confidence: float,
) -> bool:
    """Peak: chỉ mở gallery/sgc khi mặt đủ rõ (cùng ngưỡng thẻ Người)."""
    if not face_eligible:
        return False
    from .daystore import PERSON_LIST_MIN_SNAPSHOT_SCORE
    from .sink import snapshot_score

    score = snapshot_score(face_quality=float(face_quality), confidence=float(confidence))
    return score >= PERSON_LIST_MIN_SNAPSHOT_SCORE


def reset_peak_time(camera_id: str | None = None) -> None:
    with _lock:
        if camera_id is None:
            _peak_active.clear()
            return
        _peak_active.pop((camera_id or "").strip(), None)
