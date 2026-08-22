"""Đồng bộ snapshot sự kiện — bbox khớp ảnh gốc, không lệch do downscale/debounce."""

from __future__ import annotations

from typing import Any, Optional, Protocol, TypeVar

import numpy as np

T = TypeVar("T")


class _HasBbox(Protocol):
    behavior: str
    confidence: float
    bbox: list[float]


def frame_scale(analyze_frame: np.ndarray, capture_frame: np.ndarray) -> tuple[float, float]:
    sw, sh = analyze_frame.shape[1], analyze_frame.shape[0]
    ow, oh = capture_frame.shape[1], capture_frame.shape[0]
    if sw <= 0 or sh <= 0:
        return 1.0, 1.0
    return ow / sw, oh / sh


def scale_bbox(bbox: list[float] | tuple[float, ...], sx: float, sy: float) -> list[float]:
    x1, y1, x2, y2 = bbox
    return [float(x1 * sx), float(y1 * sy), float(x2 * sx), float(y2 * sy)]


def bbox_center(bbox: list[float] | tuple[float, ...]) -> tuple[float, float]:
    return (bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2


def center_inside(inner: list[float] | tuple[float, ...], outer: list[float] | tuple[float, ...]) -> bool:
    cx, cy = bbox_center(inner)
    return outer[0] <= cx <= outer[2] and outer[1] <= cy <= outer[3]


def bbox_iou(a: list[float] | tuple[float, ...], b: list[float] | tuple[float, ...]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    iw, ih = max(0.0, ix2 - ix1), max(0.0, iy2 - iy1)
    inter = iw * ih
    if inter <= 0:
        return 0.0
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def scale_detection(det: T, sx: float, sy: float) -> T:
    patch: dict = {"bbox": scale_bbox(det.bbox, sx, sy)}
    sub = getattr(det, "subject_bbox", None)
    if sub and len(sub) >= 4:
        patch["subject_bbox"] = scale_bbox(sub, sx, sy)
    return det.model_copy(update=patch)  # type: ignore[attr-defined]


def build_snapshot_episode(
    *,
    detection: T,
    analyze_frame: np.ndarray,
    capture_frame: np.ndarray,
    person_bbox: Optional[list[float]] = None,
    extra: Optional[dict[str, Any]] = None,
) -> dict[str, Any]:
    """Lưu frame gốc + bbox đã scale — snapshot/JSON khớp overlay FE."""
    sx, sy = frame_scale(analyze_frame, capture_frame)
    episode: dict[str, Any] = {
        "detection": scale_detection(detection, sx, sy),
        "frame": capture_frame.copy(),
        "analyze_frame": analyze_frame.copy(),
        "scale": (sx, sy),
    }
    if person_bbox is not None:
        episode["person_bbox"] = scale_bbox(person_bbox, sx, sy)
    if extra:
        for key, value in extra.items():
            if value is None:
                continue
            if key.endswith("_bbox") and isinstance(value, (list, tuple)) and len(value) >= 4:
                episode[key] = scale_bbox(list(value), sx, sy)
            else:
                episode[key] = value
    return episode


def pick_best_detection(
    candidates: list[T],
    *,
    behavior: str,
    anchor_bbox: list[float],
    person_bbox: Optional[list[float]] = None,
) -> Optional[T]:
    """Chọn detection khớp anchor nhất sau re-analyze."""
    pool = [d for d in candidates if d.behavior == behavior]
    if not pool:
        return None

    best: Optional[T] = None
    best_score = -1.0
    for det in pool:
        score = bbox_iou(det.bbox, anchor_bbox) * 2.0 + det.confidence
        if person_bbox and center_inside(det.bbox, person_bbox):
            score += 0.35
        elif person_bbox and behavior in ("no_helmet", "no_vest", "no_shoes"):
            cx, cy = bbox_center(det.bbox)
            px1, py1, px2, py2 = person_bbox
            if behavior == "no_helmet":
                y_ok = py1 - (py2 - py1) * 0.12 <= cy <= py1 + (py2 - py1) * 0.35
            elif behavior == "no_vest":
                y_ok = py1 + (py2 - py1) * 0.18 <= cy <= py1 + (py2 - py1) * 0.66
            else:
                y_ok = py1 + (py2 - py1) * 0.72 <= cy <= py2 + (py2 - py1) * 0.06
            if not (px1 <= cx <= px2 and y_ok):
                score -= 2.0
        if score > best_score:
            best_score = score
            best = det
    return best


def resync_ppe_episode(episode: dict[str, Any], camera_id: str) -> dict[str, Any]:
    from .ppe_analyzer import analyze_ppe_frame
    from .schemas import PpeDetection
    from .worker_identity.detection_enrich import sanitize_ppe_event_identity

    analyze_frame = episode.get("analyze_frame")
    capture_frame = episode["frame"]
    if analyze_frame is None:
        return episode

    target: PpeDetection = episode["detection"]
    person_bbox = episode.get("person_bbox")
    source_pts_sec = episode.get("source_pts_sec")
    sx, sy = episode.get("scale") or frame_scale(analyze_frame, capture_frame)
    fresh = analyze_ppe_frame(
        analyze_frame,
        camera_id,
        source_pts_sec=float(source_pts_sec) if source_pts_sec is not None else None,
    )
    rows = fresh.get("detections", [])
    detections = [PpeDetection.model_validate(row) for row in rows]

    anchor_bbox = scale_bbox(target.bbox, 1 / sx, 1 / sy)
    anchor_person = scale_bbox(person_bbox, 1 / sx, 1 / sy) if person_bbox else None
    matched = pick_best_detection(
        detections,
        behavior=target.behavior,
        anchor_bbox=anchor_bbox,
        person_bbox=anchor_person,
    )
    if matched is None:
        return episode

    synced = dict(episode)
    if anchor_person is not None:
        persons = [d for d in detections if d.behavior == "person"]
        person_match = None
        best_iou = 0.12
        for person in persons:
            from .ppe_analyzer import raw_person_bbox

            iou = bbox_iou(raw_person_bbox(person), anchor_person)
            if iou > best_iou:
                best_iou = iou
                person_match = person
        if person_match is not None:
            from .ppe_analyzer import (
                ppe_violation_display_bbox,
                raw_person_bbox,
                _cap_region_for_helmet,
                _feet_region,
                _resolve_vest_snapshot_bbox,
                _torso_violation_scan_region,
            )

            raw_person = raw_person_bbox(person_match)
            raw_tuple = tuple(float(v) for v in raw_person)
            scan_region = None
            if matched.behavior == "no_helmet":
                scan_region = _cap_region_for_helmet(raw_tuple)
            elif matched.behavior == "no_vest":
                scan_region = _torso_violation_scan_region(raw_tuple)
            elif matched.behavior == "no_shoes":
                scan_region = _feet_region(raw_tuple, analyze_frame.shape[0])
            if matched.behavior in ("no_vest", "safety_vest"):
                vest_bbox = _resolve_vest_snapshot_bbox(
                    raw_tuple,
                    analyze_frame.shape[1],
                    analyze_frame.shape[0],
                    camera_id=camera_id,
                )
                display = vest_bbox if vest_bbox is not None else (0.0, 0.0, 0.0, 0.0)
            else:
                display = ppe_violation_display_bbox(
                    raw_tuple,
                    matched.behavior,
                    analyze_frame.shape[0],
                    scan_region=scan_region,
                )
            matched = matched.model_copy(
                update={
                    "bbox": [float(v) for v in display],
                    "subject_bbox": list(raw_person),
                },
            )
            synced["person_bbox"] = scale_bbox(raw_person, sx, sy)
            synced_det = scale_detection(matched, sx, sy)
            if synced_det.behavior in ("no_helmet", "no_vest"):
                synced_det.worker_id = person_match.worker_id
                synced_det.worker_name = person_match.worker_name
                synced_det.employee_code = person_match.employee_code
                synced_det.contractor_name = person_match.contractor_name
                synced_det.face_match_confidence = person_match.face_match_confidence
                synced_det.face_match_source = getattr(person_match, "face_match_source", None)
                sanitize_ppe_event_identity(synced_det)
            synced["detection"] = synced_det
            return synced
        elif matched.behavior in ("no_vest", "safety_vest"):
            from .ppe_analyzer import _resolve_vest_snapshot_bbox

            raw_tuple = tuple(float(v) for v in anchor_person)
            vest_bbox = _resolve_vest_snapshot_bbox(
                raw_tuple,
                analyze_frame.shape[1],
                analyze_frame.shape[0],
                camera_id=camera_id,
            )
            display = vest_bbox if vest_bbox is not None else (0.0, 0.0, 0.0, 0.0)
            matched = matched.model_copy(
                update={
                    "bbox": [float(v) for v in display],
                    "subject_bbox": [float(v) for v in anchor_person],
                },
            )

    synced["detection"] = scale_detection(matched, sx, sy)
    sanitize_ppe_event_identity(synced["detection"])
    return synced


def merge_episode_best(
    current: dict[str, Any] | None,
    *,
    detection: T,
    analyze_frame: np.ndarray,
    capture_frame: np.ndarray,
    person_bbox: Optional[list[float]] = None,
    extra: Optional[dict[str, Any]] = None,
    quality: float | None = None,
) -> dict[str, Any]:
    """Giữ frame có confidence/quality cao nhất trong phiên debounce."""
    score = quality if quality is not None else float(detection.confidence)
    if current is not None:
        prev = float(current.get("quality", current["detection"].confidence))
        if score <= prev:
            return current
    episode = build_snapshot_episode(
        detection=detection,
        analyze_frame=analyze_frame,
        capture_frame=capture_frame,
        person_bbox=person_bbox,
        extra=extra,
    )
    episode["quality"] = score
    return episode
