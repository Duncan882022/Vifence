"""Phân tích PCCC thật (Cam cố định A-04) — YOLO hút thuốc + YOLO cháy + heuristic
lửa nhỏ/cận cảnh, cộng thêm model auto-train khi có checkpoint. Không dùng bbox
hiệu chuẩn tay/ảnh mẫu — dùng chung kiến trúc detector với luồng mobile
(detection_engine.py) nhưng có singleton riêng vì tách camera cố định."""

from __future__ import annotations

import logging

import numpy as np

from .auto_train import inference as auto_train_inference
from .config import settings
from .detectors import FireDetector, SmokingDetector
from .detectors.flame_blob_detector import FlameBlobDetector
from .pccc_smoking_heuristic import detect_smoking_heuristic
from .schemas import Detection
from .violation_thresholds import VIOLATION_MIN_CONFIDENCE

logger = logging.getLogger("pccc_analyzer")

# Bán kính (theo % kích thước bbox điếu thuốc) mở rộng quanh đầu điếu để loại
# trừ khói khỏi behavior "fire" khi đã quy cho hành vi hút thuốc — tránh tính
# 2 sự kiện cho cùng 1 hành vi (đồng bộ logic detection_engine.py).
_SMOKE_PROXIMITY_MARGIN = 2.5

_AUTO_TRAIN_MERGE_CONF = 0.55
_AUTO_TRAIN_MERGE_IOU = 0.4
_AUTO_TRAIN_TASK_BY_BEHAVIOR = {"fire": "fire", "smoking": "smoking"}

_detectors: list | None = None


def _get_detectors() -> list:
    global _detectors
    if _detectors is None:
        built = [
            SmokingDetector(
                settings.smoking_model_repo,
                settings.smoking_model_file,
                settings.smoking_conf_threshold,
            ),
            FireDetector(
                settings.fire_model_repo,
                settings.fire_model_file,
                settings.fire_conf_threshold,
            ),
            FlameBlobDetector(settings.flame_heuristic_conf_threshold),
        ]
        for detector in built:
            detector.load()
        _detectors = built
    return _detectors


def _expand_bbox(bbox: list[float], margin_ratio: float) -> tuple[float, float, float, float]:
    x1, y1, x2, y2 = bbox
    w, h = x2 - x1, y2 - y1
    mx, my = max(w, 10) * margin_ratio, max(h, 10) * margin_ratio
    return (x1 - mx, y1 - my * 1.5, x2 + mx, y2 + my)


def _bboxes_overlap(a: tuple[float, float, float, float], b: list[float]) -> bool:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    return not (bx2 < ax1 or bx1 > ax2 or by2 < ay1 or by1 > ay2)


def _bbox_iou(a: list[float], b: list[float]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1, iy1 = max(ax1, bx1), max(ay1, by1)
    ix2, iy2 = min(ax2, bx2), min(ay2, by2)
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0
    inter = (ix2 - ix1) * (iy2 - iy1)
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def _augment_with_auto_train_model(frame: np.ndarray, all_detections: list[Detection]) -> list[Detection]:
    """Cộng thêm box từ model tự train (nếu có checkpoint) — chỉ CỘNG THÊM
    box mới (không trùng box đã có), không bao giờ xoá/thay box gốc."""
    extra: list[Detection] = []
    for behavior, task_id in _AUTO_TRAIN_TASK_BY_BEHAVIOR.items():
        try:
            preds = auto_train_inference.predict_boxes(task_id, frame, conf_threshold=_AUTO_TRAIN_MERGE_CONF)
        except Exception:  # noqa: BLE001
            continue
        if not preds:
            continue
        existing = [d.bbox for d in all_detections if d.behavior == behavior]
        for label, x1, y1, x2, y2, conf in preds:
            box = [x1, y1, x2, y2]
            if any(_bbox_iou(box, e) >= _AUTO_TRAIN_MERGE_IOU for e in existing):
                continue
            extra.append(Detection(behavior=behavior, label=label, confidence=conf, bbox=box))
    return all_detections + extra if extra else all_detections


def _has_event_level_smoking(detections: list[Detection]) -> bool:
    return any(
        d.behavior == "smoking" and d.confidence >= VIOLATION_MIN_CONFIDENCE
        for d in detections
    )


def analyze_pccc_frame(frame: np.ndarray, camera_id: str = "A-04") -> list[Detection]:
    all_detections: list[Detection] = []
    for detector in _get_detectors():
        if not detector.ready:
            continue
        all_detections.extend(detector.predict(frame))

    all_detections = _augment_with_auto_train_model(frame, all_detections)

    if not _has_event_level_smoking(all_detections):
        heuristic_dets = detect_smoking_heuristic(frame, camera_id)
        if heuristic_dets:
            all_detections.extend(heuristic_dets)
            logger.info(
                "PCCC smoking heuristic supplement: %d detection(s)",
                len(heuristic_dets),
            )

    by_behavior: dict[str, list[Detection]] = {}
    for det in all_detections:
        by_behavior.setdefault(det.behavior, []).append(det)

    raw_cigarette_dets = by_behavior.get("smoking", [])
    fire_dets = by_behavior.get("fire", [])
    cigarette_zones = [_expand_bbox(d.bbox, _SMOKE_PROXIMITY_MARGIN) for d in raw_cigarette_dets]
    by_behavior["fire"] = [
        d
        for d in fire_dets
        if not (
            d.label.lower() == "smoke"
            and any(_bboxes_overlap(zone, d.bbox) for zone in cigarette_zones)
        )
    ]

    if settings.auto_train_enabled:
        from .auto_train import collector as auto_train_collector

        auto_train_collector.collect(
            "fire", frame, [(d.label.lower(), *d.bbox) for d in by_behavior.get("fire", [])],
        )
        auto_train_collector.collect(
            "smoking", frame, [("cigarette", *d.bbox) for d in raw_cigarette_dets],
        )

    filtered: list[Detection] = []
    for dets in by_behavior.values():
        filtered.extend(dets)
    return filtered
