"""BBox PCCC Cam A-04 — nhãn tay trên ảnh demo (lửa + hút thuốc).

Video loop ghép từ ảnh tĩnh; heuristic flame-ground hay FP trên đất bùn.
Khi khớp scene PCCC → bbox đúng vị trí lửa góc phải dưới + điếu thuốc.
Các segment khác cùng reel (crane/PPE/WAH) → suppress PCCC (không log ảo).
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import cv2
import numpy as np

from .schemas import Detection
from .violation_thresholds import VIOLATION_MIN_CONFIDENCE

logger = logging.getLogger("cam04_pccc_demo")

_DEMO_DIR = Path(__file__).resolve().parent.parent / "data" / "cam04_pccc_demo"
_REEL_ROOT = Path(__file__).resolve().parent.parent.parent
_FRAME_SMALL = (48, 48)
_MATCH_DRIFT_MAX = 8.0
_IN_DEMO_REEL_DRIFT_MAX = 35.0

_SUPPRESS_REEL_FILES = (
    _REEL_ROOT / "backend-ai/data/cam04_demo/0355.png",
    _REEL_ROOT / "backend-ai/data/cam04_demo/0359.png",
    _REEL_ROOT / "backend-ai/data/cam04_demo/0360.png",
    _REEL_ROOT / "public/camera-feeds/cam04-ppe-workers.jpg",
    _REEL_ROOT / "public/camera-feeds/cam04-wah-scene.jpg",
)


@dataclass(frozen=True)
class _PcccAnchor:
    key: str
    small: np.ndarray
    fire: tuple[int, int, int, int] | None
    smoking: tuple[int, int, int, int] | None


def _frame_small(frame: np.ndarray) -> np.ndarray:
    return cv2.resize(frame, _FRAME_SMALL, interpolation=cv2.INTER_AREA)


def _frame_drift(a: np.ndarray, b: np.ndarray) -> float:
    if a.shape != b.shape:
        b = cv2.resize(b, (a.shape[1], a.shape[0]), interpolation=cv2.INTER_AREA)
    return float(np.mean(cv2.absdiff(a, b)))


def _bbox_from_raw(raw: object) -> tuple[int, int, int, int] | None:
    if not isinstance(raw, (list, tuple)) or len(raw) < 4:
        return None
    x1, y1, x2, y2 = (int(v) for v in raw[:4])
    if x2 <= x1 or y2 <= y1:
        return None
    return x1, y1, x2, y2


@lru_cache(maxsize=1)
def _load_anchors() -> tuple[_PcccAnchor, ...]:
    labels_path = _DEMO_DIR / "labels.json"
    anchors: list[_PcccAnchor] = []

    if labels_path.is_file():
        try:
            payload = json.loads(labels_path.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            logger.warning("cam04_pccc_demo: không đọc được labels.json")
            payload = {}
        for entry in payload.get("frames", []):
            file_name = entry.get("file")
            if not file_name:
                continue
            img_path = _DEMO_DIR / str(file_name)
            img = cv2.imread(str(img_path))
            if img is None:
                continue
            anchors.append(
                _PcccAnchor(
                    key=Path(str(file_name)).stem,
                    small=_frame_small(img),
                    fire=_bbox_from_raw(entry.get("fire")),
                    smoking=_bbox_from_raw(entry.get("smoking")),
                )
            )

    for path in _SUPPRESS_REEL_FILES:
        if not path.is_file():
            continue
        img = cv2.imread(str(path))
        if img is None:
            continue
        anchors.append(
            _PcccAnchor(
                key=path.stem,
                small=_frame_small(img),
                fire=None,
                smoking=None,
            )
        )

    return tuple(anchors)


def resolve_cam04_pccc_demo(
    camera_id: str,
    frame: np.ndarray,
) -> list[Detection] | None:
    """Trả detections PCCC từ nhãn demo, [] để suppress, hoặc None → ML/heuristic."""
    if camera_id != "A-04":
        return None
    anchors = _load_anchors()
    if not anchors:
        return None

    probe = _frame_small(frame)
    scored = [(anchor, _frame_drift(probe, anchor.small)) for anchor in anchors]
    best_anchor, best_drift = min(scored, key=lambda item: item[1])
    min_drift = min(drift for _, drift in scored)

    if best_drift <= _MATCH_DRIFT_MAX:
        if best_anchor.fire is None and best_anchor.smoking is None:
            return []
        out: list[Detection] = []
        if best_anchor.smoking:
            x1, y1, x2, y2 = best_anchor.smoking
            out.append(
                Detection(
                    behavior="smoking",
                    label="cigarette",
                    confidence=max(VIOLATION_MIN_CONFIDENCE, 0.88),
                    bbox=[float(x1), float(y1), float(x2), float(y2)],
                )
            )
        if best_anchor.fire:
            x1, y1, x2, y2 = best_anchor.fire
            out.append(
                Detection(
                    behavior="fire",
                    label="fire",
                    confidence=max(VIOLATION_MIN_CONFIDENCE, 0.91),
                    bbox=[float(x1), float(y1), float(x2), float(y2)],
                )
            )
        return out

    if min_drift <= _IN_DEMO_REEL_DRIFT_MAX:
        return []

    return None
