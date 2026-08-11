"""Phân tích WAH thật — người (YOLO) + dây an toàn (heuristic màu/hình + model
auto-train), Cam A-04. Không dùng bbox hiệu chuẩn tay/ảnh mẫu."""

from __future__ import annotations

import logging

import numpy as np

from .auto_train import collector as auto_train_collector
from .config import settings
from .detectors.person_detector import PersonDetector
from .schemas import Detection
from .violation_thresholds import VIOLATION_MIN_CONFIDENCE
from .wah_harness_detector import detect_harness_on_person, harness_bbox_from_person

logger = logging.getLogger("wah_analyzer")

_PERSON_CONF = 0.45
_HARNESS_CONF = 0.62
_VIOLATION_CONF = VIOLATION_MIN_CONFIDENCE

_person_detector: PersonDetector | None = None


def _get_person_detector() -> PersonDetector:
    global _person_detector
    if _person_detector is None:
        _person_detector = PersonDetector(conf_threshold=_PERSON_CONF)
        _person_detector.load()
    return _person_detector


def _plausible_person_box(
    box: tuple[float, float, float, float],
    frame_w: int,
    frame_h: int,
) -> bool:
    """Loại bbox giả trên vật kiến trúc/lưới — chỉ giữ người có tỷ lệ hợp lý."""
    x1, y1, x2, y2 = box
    bw = max(x2 - x1, 1.0)
    bh = max(y2 - y1, 1.0)
    if bh < frame_h * 0.07 or bh > frame_h * 0.70:
        return False
    if bw < frame_w * 0.03 or bw > frame_w * 0.45:
        return False
    aspect = bh / bw
    if aspect < 1.0 or aspect > 5.2:
        return False
    return True


def _wah_edge_violation_candidate(
    box: tuple[float, float, float, float],
    frame_h: int,
) -> bool:
    """WAH-001 — chỉ log người làm việc mép biên (phía trên khung, nhìn từ dưới lên)."""
    cy = (box[1] + box[3]) / 2.0
    return cy <= frame_h * 0.42


def _collect_harness_sample(frame: np.ndarray, harness_box: tuple[float, float, float, float]) -> None:
    if not settings.auto_train_enabled:
        return
    auto_train_collector.collect(
        "wah_harness",
        frame,
        [("safety_harness", *harness_box)],
    )


def analyze_wah_frame(frame: np.ndarray, camera_id: str = "A-04") -> list[Detection]:
    detector = _get_person_detector()
    h, w = frame.shape[:2]
    raw = detector.predict(frame)

    from .worker_identity.detection_enrich import enrich_person_bbox

    detections: list[Detection] = []
    person_index = 0
    for det in raw:
        if det.confidence < _PERSON_CONF:
            continue
        box = tuple(float(v) for v in det.bbox)
        if not _plausible_person_box(box, w, h):
            continue
        if not _wah_edge_violation_candidate(box, h):
            continue

        person_det = Detection(
            behavior="person",
            label="Person",
            confidence=round(det.confidence, 3),
            bbox=list(box),
        )
        enrich_person_bbox(frame, person_det, camera_id=camera_id, person_index=person_index)
        person_index += 1
        detections.append(person_det)

        has_harness, harness_box = detect_harness_on_person(frame, box)
        if has_harness:
            hb = tuple(harness_box or harness_bbox_from_person(box))
            detections.append(
                Detection(
                    behavior="safety_harness",
                    label="Dây an toàn",
                    confidence=_HARNESS_CONF,
                    bbox=list(hb),
                )
            )
            _collect_harness_sample(frame, hb)
        else:
            detections.append(
                Detection(
                    behavior="no_harness",
                    label="Không dây an toàn",
                    confidence=round(max(_VIOLATION_CONF, det.confidence * 0.95), 3),
                    bbox=list(box),
                )
            )

    return detections
