"""Phát hiện người làm việc gần máy cẩu (≤ 1 m) — Cam A-04."""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass

import cv2
import numpy as np

from . import machinery_detector
from .auto_train.inference import predict_boxes
from .crane_roi_config import (
    CRANE_MIN_CONFIDENCE,
    DEFAULT_PIXELS_PER_METER,
    EVENT_MIN_CONFIDENCE,
    PERSON_MIN_CONFIDENCE,
    PROXIMITY_THRESHOLD_METERS,
    get_crane_work_zone,
    get_crane_zones_for_camera,
)
from .detectors.person_detector import PersonDetector
from .schemas import CraneProximityDetection
from .unknown_detection import UNKNOWN_LABEL, person_display_label

logger = logging.getLogger("crane_proximity_analyzer")

_person_detector: PersonDetector | None = None

SCENARIO_LABEL = "DZ"
SCENARIO_ID = "DZ-003"


def _get_person_detector() -> PersonDetector:
    global _person_detector
    if _person_detector is None:
        _person_detector = PersonDetector(conf_threshold=PERSON_MIN_CONFIDENCE)
        _person_detector.load()
    return _person_detector


def _polygon_to_mask(polygon: list[dict], width: int, height: int) -> np.ndarray:
    pts = np.array(
        [[int(p["x"] * width), int(p["y"] * height)] for p in polygon],
        dtype=np.int32,
    )
    mask = np.zeros((height, width), dtype=np.uint8)
    cv2.fillPoly(mask, [pts], 255)
    return mask


def _zone_bbox(polygon: list[dict], width: int, height: int) -> tuple[int, int, int, int]:
    xs = [int(p["x"] * width) for p in polygon]
    ys = [int(p["y"] * height) for p in polygon]
    return min(xs), min(ys), max(xs), max(ys)


def _center_in_mask(cx: float, cy: float, mask: np.ndarray, w: int, h: int) -> bool:
    ix, iy = int(cx), int(cy)
    if ix < 0 or iy < 0 or ix >= w or iy >= h:
        return False
    return mask[iy, ix] > 0


@dataclass
class _MachineryUnit:
    bbox: tuple[int, int, int, int]
    confidence: float
    kind: str
    label: str
    source: str


MACHINERY_LABELS = machinery_detector.MACHINERY_LABELS

MACHINERY_KIND_PRIORITY: dict[str, int] = {
    "tower_crane": 4,
    "crane_green": 3,
    "sany_drill": 3,
    "road_roller": 2,
    "dump_truck": 2,
    "forklift": 2,
    "machinery": 1,
}


def _work_zone_mask(camera_id: str, width: int, height: int) -> np.ndarray | None:
    zone = get_crane_work_zone(camera_id)
    if zone is None:
        return None
    return _polygon_to_mask(zone["polygon"], width, height)


def _machinery_display_mask(camera_id: str, width: int, height: int) -> np.ndarray | None:
    """CRANE_BODY + CRANE_WORK — hiển thị máy (cẩu tháp, khoan, xúc) trên overlay."""
    zones = get_crane_zones_for_camera(camera_id)
    if not zones:
        return None
    mask = np.zeros((height, width), dtype=np.uint8)
    for zone in zones:
        if zone.get("type") not in {"CRANE_WORK", "CRANE_BODY"}:
            continue
        pts = np.array(
            [[int(p["x"] * width), int(p["y"] * height)] for p in zone["polygon"]],
            dtype=np.int32,
        )
        cv2.fillPoly(mask, [pts], 255)
    return mask if cv2.countNonZero(mask) > 0 else None


def _anchor_in_mask(
    box: tuple[int, int, int, int],
    mask: np.ndarray | None,
    width: int,
    height: int,
) -> bool:
    if mask is None:
        return True
    cx = (box[0] + box[2]) / 2.0
    cy = float(box[3])
    return _center_in_mask(cx, cy, mask, width, height)


def _machinery_center_in_mask(
    box: tuple[int, int, int, int],
    mask: np.ndarray | None,
    width: int,
    height: int,
) -> bool:
    if mask is None:
        return True
    cx = (box[0] + box[2]) / 2.0
    cy = (box[1] + box[3]) / 2.0
    return _center_in_mask(cx, cy, mask, width, height)


def _machinery_search_mask(height: int, width: int) -> np.ndarray:
    """Giữ lại cho tương thích chữ ký cũ (crane_detection_catalog) — detector
    tổng quát tự quét toàn khung, không cần mask ROI để lọc màu nữa."""
    return np.full((height, width), 255, dtype=np.uint8)


def _units_from_detections(
    detections: list[tuple[str, tuple[int, int, int, int], float]],
    source: str,
) -> list[_MachineryUnit]:
    return [
        _MachineryUnit(
            bbox=bbox,
            confidence=conf,
            kind=kind,
            label=MACHINERY_LABELS.get(kind, "Máy thi công"),
            source=source,
        )
        for kind, bbox, conf in detections
    ]


def _rank_machinery_units(units: list[_MachineryUnit]) -> list[_MachineryUnit]:
    units.sort(
        key=lambda u: (
            MACHINERY_KIND_PRIORITY.get(u.kind, 0),
            (u.bbox[2] - u.bbox[0]) * (u.bbox[3] - u.bbox[1]),
        ),
        reverse=True,
    )
    return units[:4]


def _detect_machinery_units(frame: np.ndarray, camera_id: str) -> list[_MachineryUnit]:
    """YOLO crane_machinery (nếu có weights) → OWLv2 zero-shot trên frame hiện tại."""
    yolo_hits: list[tuple[str, tuple[int, int, int, int], float]] = []
    for label, x1, y1, x2, y2, conf in predict_boxes(
        "crane_machinery",
        frame,
        conf_threshold=CRANE_MIN_CONFIDENCE,
    ):
        bbox = (int(x1), int(y1), int(x2), int(y2))
        yolo_hits.append((label, bbox, round(conf, 3)))
    if yolo_hits:
        return _rank_machinery_units(_units_from_detections(yolo_hits, "yolo_crane_machinery"))

    owlv2_hits = machinery_detector.detect_for_frame(camera_id, frame)
    return _rank_machinery_units(
        _units_from_detections(owlv2_hits, "owlv2_zero_shot"),
    )


def _bbox_edge_distance_px(
    a: tuple[int, int, int, int],
    b: tuple[int, int, int, int],
) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    dx = max(bx1 - ax2, ax1 - bx2, 0)
    dy = max(by1 - ay2, ay1 - by2, 0)
    return math.hypot(dx, dy)


def _person_to_machinery_distance_px(
    person_box: tuple[int, int, int, int],
    machine_box: tuple[int, int, int, int],
) -> float:
    """Chân người → mép máy (inset nhẹ) — tránh ROI lớn cho 0.0 m."""
    px, py = _person_anchor(person_box)
    x1, y1, x2, y2 = machine_box
    inset_x = (x2 - x1) * 0.18
    inset_y = (y2 - y1) * 0.14
    mx1, my1 = x1 + inset_x, y1 + inset_y
    mx2, my2 = x2 - inset_x, y2 - inset_y
    nx = min(max(px, mx1), mx2)
    ny = min(max(py, my1), my2)
    dist = math.hypot(px - nx, py - ny)
    if dist < 10:
        cx = (x1 + x2) / 2.0
        cy = (y1 + y2) / 2.0
        dist = math.hypot(px - cx, py - cy) * 0.40
    return max(dist, 12.0)


def _person_anchor(box: tuple[int, int, int, int]) -> tuple[float, float]:
    x1, y1, x2, y2 = box
    return (x1 + x2) / 2.0, float(y2)


def _proximity_confidence(person_conf: float, crane_conf: float, distance_m: float) -> float:
    if distance_m > PROXIMITY_THRESHOLD_METERS:
        return 0.0
    closeness = max(0.0, 1.0 - distance_m / PROXIMITY_THRESHOLD_METERS)
    conf = 0.48 + closeness * 0.34 + person_conf * 0.12 + crane_conf * 0.08
    if distance_m <= 0.65:
        conf += 0.06
    return round(min(0.98, conf), 3)


def analyze_crane_proximity_frame(frame: np.ndarray, camera_id: str) -> dict:
    h, w = frame.shape[:2]
    px_per_m = DEFAULT_PIXELS_PER_METER
    work_mask = _work_zone_mask(camera_id, w, h)

    all_machinery = _detect_machinery_units(frame, camera_id)
    machinery_units = [
        unit for unit in all_machinery
        if _machinery_center_in_mask(unit.bbox, work_mask, w, h)
    ]
    # Overlay info: hiển thị mọi máy detect — ROI chỉ gate vi phạm khoảng cách.
    machinery_display = list(all_machinery)

    person_dets = _get_person_detector().predict(frame)
    persons: list[tuple[tuple[int, int, int, int], float]] = []
    for det in person_dets:
        if det.confidence < PERSON_MIN_CONFIDENCE:
            continue
        box = tuple(int(v) for v in det.bbox)
        if not _anchor_in_mask(box, work_mask, w, h):
            continue
        persons.append((box, det.confidence))

    all_detections: list[CraneProximityDetection] = []
    violations = 0
    min_distance: float | None = None

    for unit in machinery_display:
        all_detections.append(
            CraneProximityDetection(
                behavior="crane",
                label=unit.label,
                scenario_id=SCENARIO_ID,
                confidence=unit.confidence,
                bbox=[float(v) for v in unit.bbox],
                machine_kind=unit.kind,
            )
        )

    for box, p_conf in persons:
        all_detections.append(
            CraneProximityDetection(
                behavior="person",
                label=person_display_label(p_conf),
                scenario_id=SCENARIO_ID,
                confidence=round(p_conf, 3),
                bbox=[float(v) for v in box],
            )
        )

        nearest_unit: _MachineryUnit | None = None
        nearest_dist_m = float("inf")
        for unit in machinery_units:
            dist_px = _person_to_machinery_distance_px(box, unit.bbox)
            dist_m = dist_px / px_per_m
            if dist_m < nearest_dist_m:
                nearest_dist_m = dist_m
                nearest_unit = unit

        if nearest_unit is None:
            continue

        if min_distance is None or nearest_dist_m < min_distance:
            min_distance = nearest_dist_m

        if nearest_dist_m > PROXIMITY_THRESHOLD_METERS:
            continue

        conf = _proximity_confidence(p_conf, nearest_unit.confidence, nearest_dist_m)
        if conf < EVENT_MIN_CONFIDENCE:
            continue

        violations += 1
        all_detections.append(
            CraneProximityDetection(
                behavior="crane_proximity",
                label=SCENARIO_LABEL,
                scenario_id=SCENARIO_ID,
                confidence=conf,
                bbox=[float(v) for v in box],
                distance_m=round(nearest_dist_m, 1),
                machine_kind=nearest_unit.kind,
                machine_bbox=[float(v) for v in nearest_unit.bbox],
            )
        )

    fe_zones = [
        {
            "id": z["id"],
            "label": z["label"],
            "type": z["type"],
            "polygon": z["polygon"],
        }
        for z in get_crane_zones_for_camera(camera_id)
    ]

    return {
        "type": "result",
        "camera_id": camera_id,
        "width": w,
        "height": h,
        "roi_zones": fe_zones,
        "metrics": {
            "person_count": len(persons),
            "min_distance_m": round(min_distance, 1) if min_distance is not None else None,
            "proximity_violations": violations,
            "proximity_threshold_m": PROXIMITY_THRESHOLD_METERS,
        },
        "detections": [d.model_dump() for d in all_detections],
    }
