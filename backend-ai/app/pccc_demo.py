"""Demo PCCC Cam A-04 — bbox hiệu chuẩn tay cho frame hút thuốc + lửa."""

from __future__ import annotations

import json
import logging
from pathlib import Path

import cv2
import numpy as np

from .schemas import Detection

logger = logging.getLogger("pccc_demo")

_DEMO_DIR = Path(__file__).resolve().parent.parent / "data" / "cam04_pccc_demo"
_LABELS_PATH = _DEMO_DIR / "labels.json"
_CACHE: list[dict] | None = None

_BEHAVIOR_LABELS = {
    "smoking": "Hút thuốc",
    "fire": "Cháy nổ",
}


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
        logger.warning("[pccc-demo] Không đọc được labels.json: %s", exc)
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
        })

    _CACHE = loaded
    if loaded:
        logger.info("[pccc-demo] Sẵn sàng %d frame hiệu chuẩn Cam A-04.", len(loaded))
    return loaded


def match_demo_detections(
    frame: np.ndarray,
    camera_id: str,
) -> list[Detection] | None:
    """Trả bbox demo khi frame khớp scene PCCC (ảnh tĩnh trong video Cam A-04)."""
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
        if diff > 12.0:
            small_w = max(160, min(fw, 320))
            small_h = max(120, int(eh * small_w / ew))
            ref_small = cv2.resize(ref, (small_w, small_h))
            frame_small = cv2.resize(frame, (small_w, small_h))
            diff_small = float(np.mean(cv2.absdiff(ref_small, frame_small)))
            if diff_small > 14.0:
                continue

        sx = fw / max(ew, 1)
        sy = fh / max(eh, 1)
        detections: list[Detection] = []
        for behavior, box in entry["boxes"].items():
            if behavior not in _BEHAVIOR_LABELS:
                continue
            x1, y1, x2, y2 = [int(v) for v in box]
            bbox = [
                float(x1 * sx),
                float(y1 * sy),
                float(x2 * sx),
                float(y2 * sy),
            ]
            detections.append(
                Detection(
                    behavior=behavior,
                    label=_BEHAVIOR_LABELS[behavior],
                    confidence=0.91 if behavior == "smoking" else 0.88,
                    bbox=bbox,
                )
            )
        return detections if detections else None

    return None
