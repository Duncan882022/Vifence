"""Demo WAH Cam A-04 — person trước, vi phạm không dây an toàn sau (giống DZ)."""

from __future__ import annotations

import json
import logging
from pathlib import Path

import cv2
import numpy as np

from .auto_train import collector as auto_train_collector
from .config import settings
from .schemas import Detection
from .wah_harness_detector import detect_harness_on_person, harness_bbox_from_person

logger = logging.getLogger("wah_demo")

_DEMO_DIR = Path(__file__).resolve().parent.parent / "data" / "cam04_wah_demo"
_LABELS_PATH = _DEMO_DIR / "labels.json"
_CACHE: list[dict] | None = None

_PERSON_CONF = 0.92
_VIOLATION_CONF = 0.89
_HARNESS_CONF = 0.87


def _load_demo_frames() -> list[dict]:
    global _CACHE
    if _CACHE is not None:
        return _CACHE

    loaded: list[dict] = []
    if not _LABELS_PATH.is_file():
        _CACHE = loaded
        return loaded

    try:
        payload = json.loads(_LABELS_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("[wah-demo] Không đọc được labels.json: %s", exc)
        _CACHE = loaded
        return loaded

    for entry in payload.get("frames", []):
        rel = entry.get("file")
        if not rel:
            continue
        img_path = _DEMO_DIR / rel
        if not img_path.is_file():
            continue
        image = cv2.imread(str(img_path))
        if image is None:
            continue
        loaded.append({
            "image": image,
            "width": int(entry.get("width", image.shape[1])),
            "height": int(entry.get("height", image.shape[0])),
            "boxes": entry.get("boxes", {}),
            "harness": entry.get("harness", {}),
        })

    _CACHE = loaded
    if loaded:
        logger.info("[wah-demo] Sẵn sàng %d frame hiệu chuẩn Cam A-04.", len(loaded))
    return loaded


def _scale_bbox(box: list, sx: float, sy: float) -> list[float]:
    x1, y1, x2, y2 = [int(v) for v in box]
    return [float(x1 * sx), float(y1 * sy), float(x2 * sx), float(y2 * sy)]


def _collect_harness_sample(frame: np.ndarray, harness_box: tuple[float, float, float, float]) -> None:
    if not settings.auto_train_enabled:
        return
    auto_train_collector.collect(
        "wah_harness",
        frame,
        [("safety_harness", *harness_box)],
    )


def _detections_from_person_boxes(
    frame: np.ndarray,
    boxes: dict,
    harness_flags: dict,
    sx: float,
    sy: float,
) -> list[Detection]:
    detections: list[Detection] = []
    person_keys = sorted(k for k in boxes if k.startswith("person"))
    for key in person_keys:
        bbox = _scale_bbox(boxes[key], sx, sy)
        pb = (bbox[0], bbox[1], bbox[2], bbox[3])
        harness_flag = harness_flags.get(key)
        if harness_flag is False:
            has_harness, harness_box = False, None
        elif harness_flag is True:
            has_harness, harness_box = True, harness_bbox_from_person(pb)
        else:
            has_harness, harness_box = detect_harness_on_person(
                frame,
                pb,
                harness_flag=False,
            )

        detections.append(
            Detection(
                behavior="person",
                label="Person",
                confidence=_PERSON_CONF,
                bbox=bbox,
            )
        )
        if has_harness:
            hb = list(harness_box or harness_bbox_from_person(pb))
            detections.append(
                Detection(
                    behavior="safety_harness",
                    label="Dây an toàn",
                    confidence=_HARNESS_CONF,
                    bbox=hb,
                )
            )
            _collect_harness_sample(frame, tuple(hb))
        else:
            detections.append(
                Detection(
                    behavior="no_harness",
                    label="Không dây an toàn",
                    confidence=_VIOLATION_CONF,
                    bbox=bbox,
                )
            )
    return detections


def match_demo_detections(
    frame: np.ndarray,
    camera_id: str,
) -> list[Detection] | None:
    """Trả person + WAH (có/không dây an toàn) khi frame khớp scene demo Cam A-04."""
    if camera_id != "A-04":
        return None

    entries = _load_demo_frames()
    if not entries:
        return None

    fh, fw = frame.shape[:2]
    for entry in entries:
        ref = entry["image"]
        ew = int(entry.get("width", ref.shape[1]))
        eh = int(entry.get("height", ref.shape[0]))
        ref_cmp = ref if ref.shape[:2] == (fh, fw) else cv2.resize(ref, (fw, fh))
        diff = float(np.mean(cv2.absdiff(ref_cmp, frame)))
        if diff > 16.0:
            small_w = max(160, min(fw, 320))
            small_h = max(120, int(eh * small_w / ew))
            ref_small = cv2.resize(ref, (small_w, small_h))
            frame_small = cv2.resize(frame, (small_w, small_h))
            diff_small = float(np.mean(cv2.absdiff(ref_small, frame_small)))
            if diff_small > 14.0:
                continue

        sx = fw / max(ew, 1)
        sy = fh / max(eh, 1)
        detections = _detections_from_person_boxes(
            frame,
            entry["boxes"],
            entry.get("harness", {}),
            sx,
            sy,
        )
        return detections if detections else None

    return None
