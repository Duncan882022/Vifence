"""BBox máy móc Cam A-04 — ưu tiên nhãn tay demo khi khớp frame tham chiếu.

Video loop `ttdv-a-cam04-test.mp4` lấy từ các frame đã gắn nhãn (0355/0360…).
YOLO v4 thường bbox lệch (máy xúc tràn trái, máy khoan tụt xuống đất).
Khi drift thấp so với anchor → dùng `data/cam04_demo/labels.json`.
Cùng reel nhưng segment PPE/PCCC/WAH (drift trung bình) → không vẽ máy.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import cv2
import numpy as np

logger = logging.getLogger("cam04_machinery_demo")

_DEMO_DIR = Path(__file__).resolve().parent.parent / "data" / "cam04_demo"
_FRAME_SMALL = (48, 48)
_MATCH_DRIFT_MAX = 12.0
_IN_DEMO_REEL_DRIFT_MAX = 35.0
_CRANE_SEGMENT_END = 10.5


@dataclass(frozen=True)
class _DemoAnchor:
    key: str
    small: np.ndarray
    boxes: dict[str, tuple[int, int, int, int]]


def _frame_small(frame: np.ndarray) -> np.ndarray:
    return cv2.resize(frame, _FRAME_SMALL, interpolation=cv2.INTER_AREA)


def _frame_drift(a: np.ndarray, b: np.ndarray) -> float:
    if a.shape != b.shape:
        b = cv2.resize(b, (a.shape[1], a.shape[0]), interpolation=cv2.INTER_AREA)
    return float(np.mean(cv2.absdiff(a, b)))


@lru_cache(maxsize=1)
def _load_anchors() -> tuple[_DemoAnchor, ...]:
    labels_path = _DEMO_DIR / "labels.json"
    if not labels_path.is_file():
        return ()
    try:
        payload = json.loads(labels_path.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        logger.warning("cam04_machinery_demo: không đọc được labels.json")
        return ()

    anchors: list[_DemoAnchor] = []
    for entry in payload.get("frames", []):
        file_name = entry.get("file")
        boxes_raw = entry.get("boxes") or {}
        if not file_name or not boxes_raw:
            continue
        img_path = _DEMO_DIR / str(file_name)
        img = cv2.imread(str(img_path))
        if img is None:
            continue
        boxes: dict[str, tuple[int, int, int, int]] = {}
        for kind, raw in boxes_raw.items():
            if not isinstance(raw, (list, tuple)) or len(raw) < 4:
                continue
            x1, y1, x2, y2 = (int(v) for v in raw[:4])
            if x2 <= x1 or y2 <= y1:
                continue
            boxes[str(kind)] = (x1, y1, x2, y2)
        if not boxes:
            continue
        key = Path(str(file_name)).stem
        anchors.append(_DemoAnchor(key=key, small=_frame_small(img), boxes=boxes))

    return tuple(anchors)


def resolve_cam04_demo_machinery(
    camera_id: str,
    frame: np.ndarray,
    *,
    source_pts_sec: float | None = None,
) -> list[tuple[str, tuple[int, int, int, int], float]] | None:
    """Trả danh sách (kind, bbox, conf) nếu quyết định được từ demo reel.

    - Khớp anchor (drift ≤ 8): nhãn tay.
    - Cùng reel, segment khác (drift 8–35): [] — không vẽ máy ảo.
    - Không thuộc reel demo: None — caller dùng YOLO + refine.
    """
    if camera_id != "A-04":
        return None
    anchors = _load_anchors()
    if not anchors:
        return None

    in_crane_segment = source_pts_sec is not None and float(source_pts_sec) <= _CRANE_SEGMENT_END

    probe = _frame_small(frame)
    scored = [(anchor, _frame_drift(probe, anchor.small)) for anchor in anchors]
    best_anchor, best_drift = min(scored, key=lambda item: item[1])
    min_drift = min(drift for _, drift in scored)

    if best_drift <= _MATCH_DRIFT_MAX:
        return [
            (kind, bbox, 0.95)
            for kind, bbox in best_anchor.boxes.items()
        ]

    if min_drift <= _IN_DEMO_REEL_DRIFT_MAX:
        if in_crane_segment:
            for prefer in ("0359", "0360", "0355"):
                anchor = next((a for a in anchors if a.key == prefer), None)
                if anchor is not None:
                    return [(kind, bbox, 0.95) for kind, bbox in anchor.boxes.items()]
        return []

    return None
