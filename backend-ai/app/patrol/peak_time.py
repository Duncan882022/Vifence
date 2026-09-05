"""Peak time — đám đông trong khung: định danh rõ → pers; còn lại lượt gặm N + 1 thẻ nhóm."""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from typing import Any, Sequence

from ..config import settings

_lock = threading.Lock()
_peak_active: dict[str, bool] = {}


@dataclass
class PeakCrowdMember:
    track_id: str
    person_bbox: list[float]
    confidence: float


@dataclass
class _CrowdSession:
    object_id: str | None = None
    locked: bool = False
    last_touch_at: float = 0.0


_crowd_sessions: dict[str, _CrowdSession] = {}


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
        was_active = _peak_active.get(cam, False)
        active = was_active
        if frame_person_count >= enter:
            active = True
        elif frame_person_count <= exit_at:
            active = False
        _peak_active[cam] = active
        if was_active and not active:
            _crowd_sessions.pop(cam, None)
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


def _ensure_crowd_object_id(camera_id: str, ts: float) -> str:
    """Một obj-* cố định cho thẻ snapshot nhóm — không ghi lượt gặm ledger."""
    cam = (camera_id or "").strip()
    with _lock:
        state = _crowd_sessions.get(cam)
        if state and state.object_id:
            return state.object_id

    from . import daystore

    obj_id = daystore.touch_object(
        None,
        camera_id=cam,
        now=ts,
        seen_since=ts,
        skip_appearance=True,
    )
    with _lock:
        _crowd_sessions[cam] = _CrowdSession(object_id=obj_id, locked=True, last_touch_at=ts)
    return obj_id


def record_peak_crowd_frame(
    camera_id: str,
    members: list[PeakCrowdMember],
    frame: Any,
    now: float | None = None,
) -> str | None:
    """Cập nhật snapshot nhóm UI — lượt gặm từng silhouette qua density encounter."""
    if not members:
        return None
    ts = now or time.time()
    cam = (camera_id or "").strip()
    if not cam:
        return None

    obj_id = _ensure_crowd_object_id(cam, ts)
    best = max(members, key=lambda m: float(m.confidence))

    from . import daystore
    from .sink import CARD_SNAPSHOT_LUOT, _maybe_write_snapshot, _resolve_observation_gps, snapshot_score

    shot_score = snapshot_score(face_quality=0.0, confidence=float(best.confidence))
    path = _maybe_write_snapshot(
        obj_id,
        frame,
        best.person_bbox,
        score=shot_score,
        tier="object",
        worker_name=f"Nhóm {len(members)}",
        luot_key=CARD_SNAPSHOT_LUOT,
    )
    gps_lat, gps_lng = _resolve_observation_gps(cam, at_ts=ts)

    with _lock:
        state = _crowd_sessions.setdefault(cam, _CrowdSession())
        state.object_id = obj_id
        state.locked = True
        state.last_touch_at = ts

    daystore.touch_object(
        obj_id,
        camera_id=cam,
        snapshot_path=path,
        snapshot_score=shot_score if path else 0.0,
        now=ts,
        seen_since=None,
        gps_lat=gps_lat,
        gps_lng=gps_lng,
        skip_appearance=True,
    )
    return obj_id


def assign_peak_crowd_detection_fields(
    detections: Sequence[Any],
    members: list[PeakCrowdMember],
    crowd_object_id: str,
) -> None:
    """Gắn tag nhóm + số thứ tự ROI cho từng silhouette trong đám."""
    if not members or not crowd_object_id:
        return
    track_to_index = _rank_crowd_indices(members)
    size = len(members)
    track_ids = set(track_to_index)
    for det in detections:
        tid = (getattr(det, "track_id", None) or "").strip()
        if tid not in track_ids:
            continue
        idx = track_to_index[tid]
        det.worker_id = crowd_object_id
        det.worker_name = f"Nhóm {size}"
        det.tier = "object"
        det.peak_group = True
        det.peak_group_index = idx
        det.peak_group_size = size
        det.label = f"#{idx}"
        from ..patrol.tier_snapshot import attach_tier_snapshot_to_detection

        attach_tier_snapshot_to_detection(
            det,
            tier="object",
            tier_since=0.0,
            camera_id=str(getattr(det, "camera_id", "") or ""),
            track_id=tid,
            worker_id=crowd_object_id,
            subject_id=crowd_object_id,
            confidence=float(getattr(det, "confidence", 0.0) or 0.0),
            bbox=list(getattr(det, "bbox", []) or []),
            tier_source="peak_crowd",
        )


def _rank_crowd_indices(members: list[PeakCrowdMember]) -> dict[str, int]:
    ordered = sorted(
        members,
        key=lambda m: (float(m.person_bbox[0]), float(m.person_bbox[1]), m.track_id),
    )
    return {m.track_id: i + 1 for i, m in enumerate(ordered)}


def reset_peak_time(camera_id: str | None = None) -> None:
    with _lock:
        if camera_id is None:
            _peak_active.clear()
            _crowd_sessions.clear()
            return
        cam = (camera_id or "").strip()
        _peak_active.pop(cam, None)
        _crowd_sessions.pop(cam, None)
