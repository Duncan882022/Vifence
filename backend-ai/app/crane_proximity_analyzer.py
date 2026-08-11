"""Phát hiện người làm việc gần máy cẩu (≤ 1 m) — Cam A-04."""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass

import cv2
import numpy as np

from . import machinery_detector
from .auto_train.inference import predict_boxes
from .cam04_machinery_demo import resolve_cam04_demo_machinery
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


def _machinery_iou(
    a: tuple[int, int, int, int],
    b: tuple[int, int, int, int],
) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0
    inter = (ix2 - ix1) * (iy2 - iy1)
    aa = max((ax2 - ax1) * (ay2 - ay1), 1)
    bb = max((bx2 - bx1) * (by2 - by1), 1)
    return inter / (aa + bb - inter)


def _nms_machinery_hits(
    hits: list[tuple[str, tuple[int, int, int, int], float]],
    *,
    iou_threshold: float = 0.45,
) -> list[tuple[str, tuple[int, int, int, int], float]]:
    """Mỗi loại máy tối đa 1 bbox — giữ conf cao nhất."""
    grouped: dict[str, list[tuple[tuple[int, int, int, int], float]]] = {}
    for kind, bbox, conf in hits:
        grouped.setdefault(kind, []).append((bbox, conf))

    merged: list[tuple[str, tuple[int, int, int, int], float]] = []
    for kind, items in grouped.items():
        items.sort(key=lambda row: row[1], reverse=True)
        kept: list[tuple[tuple[int, int, int, int], float]] = []
        for bbox, conf in items:
            if any(_machinery_iou(bbox, prev) > iou_threshold for prev, _ in kept):
                continue
            kept.append((bbox, conf))
        for bbox, conf in kept[:1]:
            merged.append((kind, bbox, conf))
    return merged


def _machinery_color_mask(hsv: np.ndarray, kind: str) -> np.ndarray:
    h, s, v = cv2.split(hsv)
    if kind == "crane_green":
        return (
            (h >= 32) & (h <= 95) & (s > 35) & (v > 40)
        ).astype(np.uint8) * 255
    if kind == "sany_drill":
        orange = ((h >= 5) & (h <= 28) & (s > 45) & (v > 55)).astype(np.uint8) * 255
        yellow = ((h >= 18) & (h <= 38) & (s > 40) & (v > 70)).astype(np.uint8) * 255
        return cv2.bitwise_or(orange, yellow)
    if kind == "tower_crane":
        warm = ((h >= 12) & (h <= 42) & (s > 25) & (v > 45)).astype(np.uint8) * 255
        neutral = ((s < 55) & (v > 75)).astype(np.uint8) * 255
        return cv2.bitwise_or(warm, neutral)
    return ((s > 20) & (v > 35)).astype(np.uint8) * 255


def _refine_machinery_bbox(
    frame: np.ndarray,
    kind: str,
    box: tuple[int, int, int, int],
) -> tuple[int, int, int, int]:
    """Siết bbox YOLO/OWLv2 theo màu thân máy — bỏ nền đất/trời thừa."""
    h, w = frame.shape[:2]
    x1, y1, x2, y2 = (int(v) for v in box)
    bw, bh = max(x2 - x1, 1), max(y2 - y1, 1)
    if bw < 24 or bh < 24:
        return box

    pad_x = max(8, int(bw * 0.08))
    pad_y = max(8, int(bh * 0.06))
    ex1 = max(0, x1 - pad_x)
    ex2 = min(w, x2 + pad_x)
    ey1 = max(0, y1 - pad_y)
    ey2 = min(h, y2 + pad_y)

    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    patch = hsv[ey1:ey2, ex1:ex2]
    mask = _machinery_color_mask(patch, kind)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel, iterations=2)

    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    best: tuple[int, int, int, int] | None = None
    best_score = 0.0
    orig_cx = (x1 + x2) / 2.0
    orig_cy = (y1 + y2) / 2.0
    for ctn in cnts:
        area = cv2.contourArea(ctn)
        if area < 900:
            continue
        rx, ry, rbw, rbh = cv2.boundingRect(ctn)
        if rbw < 12 or rbh < 12:
            continue
        tx1, ty1 = rx + ex1, ry + ey1
        tx2, ty2 = tx1 + rbw, ty1 + rbh
        ccx = (tx1 + tx2) / 2.0
        ccy = (ty1 + ty2) / 2.0
        dist = math.hypot(ccx - orig_cx, ccy - orig_cy)
        score = area - dist * 2.4
        if score > best_score:
            best_score = score
            best = (tx1, ty1, tx2, ty2)

    if best is None:
        return box

    tx1, ty1, tx2, ty2 = best
    # Giữ chiều cao gốc cho máy khoan — tránh cắt mất cột khoan.
    if kind == "sany_drill":
        ty1 = min(ty1, y1 + int(bh * 0.08))
        ty2 = max(ty2, y2 - int(bh * 0.04))
    elif kind == "crane_green":
        tx1 = max(tx1, x1 + int(bw * 0.12))
        ty1 = max(ty1, y1 + int(bh * 0.10))

    if tx2 - tx1 < 20 or ty2 - ty1 < 20:
        return box
    if _machinery_iou((tx1, ty1, tx2, ty2), box) < 0.12:
        return box
    return tx1, ty1, tx2, ty2


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
    """Nhãn demo Cam A-04 (khớp frame) → YOLO crane_machinery → OWLv2."""
    demo_hits = resolve_cam04_demo_machinery(camera_id, frame)
    if demo_hits is not None:
        return _rank_machinery_units(
            _units_from_detections(demo_hits, "cam04_demo_labels"),
        )

    yolo_hits: list[tuple[str, tuple[int, int, int, int], float]] = []
    for label, x1, y1, x2, y2, conf in predict_boxes(
        "crane_machinery",
        frame,
        conf_threshold=CRANE_MIN_CONFIDENCE,
    ):
        bbox = _refine_machinery_bbox(
            frame,
            label,
            (int(x1), int(y1), int(x2), int(y2)),
        )
        yolo_hits.append((label, bbox, round(conf, 3)))
    if yolo_hits:
        merged = _nms_machinery_hits(yolo_hits)
        return _rank_machinery_units(
            _units_from_detections(merged, "yolo_crane_machinery"),
        )

    owlv2_hits = machinery_detector.detect_for_frame(camera_id, frame)
    refined = [
        (kind, _refine_machinery_bbox(frame, kind, bbox), conf)
        for kind, bbox, conf in owlv2_hits
    ]
    merged = _nms_machinery_hits(refined)
    return _rank_machinery_units(
        _units_from_detections(merged, "owlv2_zero_shot"),
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
    """Mép bbox người → mép bbox máy — ổn định khi chân người nằm dưới thân máy cao."""
    edge = _bbox_edge_distance_px(person_box, machine_box)
    if edge <= 0:
        return 12.0
    px, py = _person_anchor(person_box)
    x1, y1, x2, y2 = machine_box
    cx, cy = (x1 + x2) / 2.0, (y1 + y2) / 2.0
    anchor_dist = math.hypot(px - cx, py - cy) * 0.35
    return max(min(edge, anchor_dist), 12.0)


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

    from .worker_identity.detection_enrich import enrich_person_bbox

    for person_index, (box, p_conf) in enumerate(persons):
        person_det = CraneProximityDetection(
            behavior="person",
            label=person_display_label(p_conf),
            scenario_id=SCENARIO_ID,
            confidence=round(p_conf, 3),
            bbox=[float(v) for v in box],
        )
        enrich_person_bbox(frame, person_det, camera_id=camera_id, person_index=person_index)
        all_detections.append(person_det)

        nearest_unit: _MachineryUnit | None = None
        nearest_dist_m = float("inf")
        # Khoảng cách tới mọi máy trong khung — ROI CRANE_WORK chỉ gate người,
        # không loại máy có tâm ngoài polygon (cẩu tháp thường nằm phía trên).
        proximity_units = all_machinery if all_machinery else machinery_units
        for unit in proximity_units:
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
        proximity_det = CraneProximityDetection(
            behavior="crane_proximity",
            label=SCENARIO_LABEL,
            scenario_id=SCENARIO_ID,
            confidence=conf,
            bbox=[float(v) for v in box],
            distance_m=round(nearest_dist_m, 1),
            machine_kind=nearest_unit.kind,
            machine_bbox=[float(v) for v in nearest_unit.bbox],
        )
        if person_det.worker_id:
            proximity_det.worker_id = person_det.worker_id
            proximity_det.worker_name = person_det.worker_name
            proximity_det.employee_code = person_det.employee_code
            proximity_det.contractor_name = person_det.contractor_name
            proximity_det.face_match_confidence = person_det.face_match_confidence
        all_detections.append(proximity_det)

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
