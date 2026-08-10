"""Gắn nhận diện công nhân vào bbox person trên overlay live."""

from __future__ import annotations

import numpy as np

from ..schemas import CraneProximityDetection, Detection, PpeDetection
from .models import WorkerMatch
from .recognizer import identify_person, unknown_worker_match


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


def copy_worker_identity(
    src: PpeDetection | CraneProximityDetection | Detection,
    dst: PpeDetection | CraneProximityDetection | Detection,
) -> None:
    """Sao chép worker_* từ bbox person sang detection vi phạm."""
    dst.worker_id = src.worker_id
    dst.worker_name = src.worker_name
    dst.employee_code = src.employee_code
    dst.contractor_name = src.contractor_name
    dst.face_match_confidence = src.face_match_confidence


def enrich_person_bbox(
    frame: np.ndarray,
    det: PpeDetection | CraneProximityDetection | Detection,
    *,
    camera_id: str,
    person_index: int = 0,
) -> WorkerMatch:
    """Detect mặt trong bbox người — gallery match hoặc Unknown."""
    track_id = person_track_id(person_index, det.bbox)
    match = identify_person(frame, det.bbox, camera_id=camera_id, track_id=track_id)
    _apply_match(det, match)
    return match


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


def enrich_smoking_detection(
    frame: np.ndarray,
    detection: Detection,
    *,
    camera_id: str,
    person_index: int = 0,
) -> WorkerMatch:
    """Gắn nhận diện người hút thuốc — luôn có worker_name (Unknown nếu không khớp)."""
    person_bbox = resolve_smoking_person_bbox(frame, detection)
    if not person_bbox:
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
    )
    copy_worker_identity(holder, detection)
    return match
