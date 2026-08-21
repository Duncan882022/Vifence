"""Gắn nhận diện công nhân vào bbox person trên overlay live."""

from __future__ import annotations

import numpy as np

from ..schemas import CraneProximityDetection, Detection, PpeDetection
from .models import WorkerMatch
from .demo_roster import demo_smoking_match
from .recognizer import identify_person, unknown_worker_match
from .verify import PPE_IDENTITY_BEHAVIORS, is_verified_face_match, worker_match_from_detection


def person_track_id(index: int, bbox: list[float]) -> str:
    cx = int((bbox[0] + bbox[2]) / 2)
    cy = int((bbox[1] + bbox[3]) / 2)
    return f"p{index}:{cx}:{cy}"


def _apply_match(
    det: PpeDetection | CraneProximityDetection | Detection,
    match: WorkerMatch,
) -> None:
    det.worker_id = match.worker_id
    det.worker_name = match.worker_name
    det.employee_code = match.employee_code
    det.contractor_name = match.contractor_name
    det.face_match_confidence = match.confidence
    det.face_match_source = match.match_source


def apply_verified_worker_match(
    det: PpeDetection | CraneProximityDetection | Detection,
    match: WorkerMatch,
) -> WorkerMatch:
    """Chỉ gắn tên khi khớp mặt gallery — còn lại Unknown."""
    if is_verified_face_match(match):
        _apply_match(det, match)
        return match
    unknown = unknown_worker_match(
        match.match_source if match.worker_id == "unknown" else "face_unverified",
    )
    _apply_match(det, unknown)
    return unknown


def copy_worker_identity(
    src: PpeDetection | CraneProximityDetection | Detection,
    dst: PpeDetection | CraneProximityDetection | Detection,
) -> None:
    """Sao chép worker_* từ bbox person — PPE-003 không gắn tên; còn lại cần xác minh mặt."""
    behavior = getattr(dst, "behavior", None)
    if behavior == "no_shoes":
        apply_verified_worker_match(dst, unknown_worker_match("ppe_no_identity"))
        return
    src_match = worker_match_from_detection(src)
    if not is_verified_face_match(src_match):
        apply_verified_worker_match(dst, unknown_worker_match("face_unverified"))
        return
    _apply_match(dst, src_match)


def sanitize_ppe_event_identity(det: PpeDetection) -> None:
    """Chuẩn hóa danh tính trước khi ghi sự kiện PPE — loại tên ảo trên PPE-003."""
    if det.behavior not in PPE_IDENTITY_BEHAVIORS:
        apply_verified_worker_match(det, unknown_worker_match("ppe_no_identity"))
        return
    match = worker_match_from_detection(det)
    apply_verified_worker_match(det, match)


def enrich_person_bbox(
    frame: np.ndarray,
    det: PpeDetection | CraneProximityDetection | Detection,
    *,
    camera_id: str,
    person_index: int = 0,
    source_pts_sec: float | None = None,
) -> WorkerMatch:
    """Detect mặt trong bbox người — gallery match hoặc Unknown."""
    from .person_gate import person_eligible_for_face_identity

    if not person_eligible_for_face_identity(
        frame,
        det.bbox,
        camera_id=camera_id,
        source_pts_sec=source_pts_sec,
    ):
        unknown = unknown_worker_match("person_ineligible")
        return apply_verified_worker_match(det, unknown)

    track_id = person_track_id(person_index, det.bbox)
    match = identify_person(frame, det.bbox, camera_id=camera_id, track_id=track_id)
    return apply_verified_worker_match(det, match)


def _center_inside(inner: list[float], outer: list[float]) -> bool:
    cx = (inner[0] + inner[2]) / 2
    cy = (inner[1] + inner[3]) / 2
    return outer[0] <= cx <= outer[2] and outer[1] <= cy <= outer[3]


def resolve_smoking_person_bbox(frame: np.ndarray, detection: Detection) -> list[float] | None:
    """Tìm bbox người cho vi phạm hút thuốc — ưu tiên subject_bbox, fallback person detector."""
    subject = getattr(detection, "subject_bbox", None)
    if subject and len(subject) >= 4:
        return [float(v) for v in subject]

    from ..detectors.person_detector import PersonDetector

    cx = (detection.bbox[0] + detection.bbox[2]) / 2
    cy = (detection.bbox[1] + detection.bbox[3]) / 2
    detector = PersonDetector(conf_threshold=0.42)
    if not detector.ready:
        detector.load()
    if not detector.ready:
        return None

    best: list[float] | None = None
    best_area = float("inf")
    for person in detector.predict(frame):
        if person.confidence < 0.45:
            continue
        pb = [float(v) for v in person.bbox]
        if not _center_inside([cx, cy, cx, cy], pb):
            continue
        area = (pb[2] - pb[0]) * (pb[3] - pb[1])
        if area < best_area:
            best_area = area
            best = pb
    return best


def _apply_smoking_demo_match(camera_id: str) -> WorkerMatch | None:
    from ..config import settings

    if not settings.worker_demo_fallback_enabled:
        return None
    return demo_smoking_match(camera_id)


def enrich_smoking_detection(
    frame: np.ndarray,
    detection: Detection,
    *,
    camera_id: str,
    person_index: int = 0,
    source_pts_sec: float | None = None,
) -> WorkerMatch:
    """Gắn nhận diện người hút thuốc — luôn có worker_name (Unknown nếu không khớp)."""
    person_bbox = resolve_smoking_person_bbox(frame, detection)
    if not person_bbox:
        from ..config import settings

        if settings.worker_demo_fallback_enabled:
            demo = _apply_smoking_demo_match(camera_id)
            if demo is not None:
                apply_verified_worker_match(detection, demo)
                return demo
        match = unknown_worker_match("no_person_bbox")
        _apply_match(detection, match)
        return match

    detection.subject_bbox = person_bbox
    holder = Detection(
        behavior="person",
        label="person",
        confidence=detection.confidence,
        bbox=person_bbox,
    )
    match = enrich_person_bbox(
        frame,
        holder,
        camera_id=camera_id,
        person_index=person_index,
        source_pts_sec=source_pts_sec,
    )
    if match.worker_id == "unknown":
        from ..config import settings

        if settings.worker_demo_fallback_enabled:
            demo = _apply_smoking_demo_match(camera_id)
            if demo is not None:
                match = demo
                apply_verified_worker_match(holder, match)
    copy_worker_identity(holder, detection)
    return match
