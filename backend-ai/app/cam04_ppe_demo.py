"""PPE Cam A-04 — suppress vi phạm ảo trên reel demo ghép ảnh tĩnh.

`ttdv-a-cam04-test.mp4` = crane + PPE + PCCC + WAH. Heuristic PPE hay FP trên
scene không thuộc module PPE (mũ/áo bị miss trên công nhân PCCC/WAH).
Chỉ segment `cam04-ppe-workers.jpg` chạy ML/heuristic đầy đủ; các segment khác
cùng reel → suppress (chỉ person, không log no_helmet/no_vest/no_shoes).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Literal, Optional

import cv2
import numpy as np

logger = logging.getLogger("cam04_ppe_demo")

_REEL_ROOT = Path(__file__).resolve().parent.parent.parent
_DEMO_DATA = Path(__file__).resolve().parent.parent / "data" / "cam04_demo"
_FRAME_SMALL = (48, 48)
_MATCH_DRIFT_MAX = 8.0
_IN_DEMO_REEL_DRIFT_MAX = 35.0
# Frame gần cam04-ppe-workers (drift ≤17) vẫn chạy PPE dù anchor 0360 khớp hơn @ t≈8–10s.
_PPE_SCENE_DRIFT_MAX = 20.0

_PPE_SCENE_STEM = "cam04-ppe-workers"
_WAH_SCENE_STEM = "cam04-wah-scene"
_WAH_SCENE_DRIFT_MAX = 20.0

_REEL_ANCHOR_FILES = (
    _DEMO_DATA / "0355.png",
    _DEMO_DATA / "0359.png",
    _DEMO_DATA / "0360.png",
    _DEMO_DATA / "cam04-ppe-workers.jpg",
    _DEMO_DATA / "cam04-pccc-scene.jpg",
    _DEMO_DATA / "cam04-wah-scene.jpg",
    _REEL_ROOT / "public/camera-feeds/cam04-ppe-workers.jpg",
    _REEL_ROOT / "public/camera-feeds/cam04-pccc-scene.jpg",
    _REEL_ROOT / "public/camera-feeds/cam04-wah-scene.jpg",
)

Cam04PpeDemoAction = Optional[Literal["suppress", "vest_only"]]


@dataclass(frozen=True)
class _PpeAnchor:
    key: str
    small: np.ndarray
    is_ppe_scene: bool
    is_wah_scene: bool = False


def _frame_small(frame: np.ndarray) -> np.ndarray:
    return cv2.resize(frame, _FRAME_SMALL, interpolation=cv2.INTER_AREA)


def _frame_drift(a: np.ndarray, b: np.ndarray) -> float:
    if a.shape != b.shape:
        b = cv2.resize(b, (a.shape[1], a.shape[0]), interpolation=cv2.INTER_AREA)
    return float(np.mean(cv2.absdiff(a, b)))


@lru_cache(maxsize=1)
def _load_anchors() -> tuple[_PpeAnchor, ...]:
    anchors: list[_PpeAnchor] = []
    for path in _REEL_ANCHOR_FILES:
        if not path.is_file():
            continue
        img = cv2.imread(str(path))
        if img is None:
            continue
        stem = path.stem
        anchors.append(
            _PpeAnchor(
                key=stem,
                small=_frame_small(img),
                is_ppe_scene=stem == _PPE_SCENE_STEM,
                is_wah_scene=stem == _WAH_SCENE_STEM,
            )
        )
    return tuple(anchors)


def resolve_cam04_ppe_demo(camera_id: str, frame: np.ndarray) -> Cam04PpeDemoAction:
    """None → PPE đầy đủ; 'vest_only' → WAH segment, chỉ log thiếu áo phản quang; 'suppress' → chỉ person."""
    if camera_id != "A-04":
        return None
    anchors = _load_anchors()
    if not anchors:
        return None

    probe = _frame_small(frame)
    scored = [(anchor, _frame_drift(probe, anchor.small)) for anchor in anchors]
    min_drift = min(drift for _, drift in scored)

    if min_drift > _IN_DEMO_REEL_DRIFT_MAX:
        return None

    ppe_drifts = [drift for anchor, drift in scored if anchor.is_ppe_scene]
    if ppe_drifts and min(ppe_drifts) <= _PPE_SCENE_DRIFT_MAX:
        return None

    wah_drifts = [drift for anchor, drift in scored if anchor.is_wah_scene]
    if wah_drifts and min(wah_drifts) <= _WAH_SCENE_DRIFT_MAX:
        return "vest_only"

    best_anchor, _best_drift = min(scored, key=lambda item: item[1])
    if best_anchor.is_ppe_scene:
        return None

    return "suppress"


def is_cam04_ppe_scene(camera_id: str, frame: np.ndarray) -> bool:
    """True khi frame thuộc segment PPE demo (cam04-ppe-workers) trong reel A-04."""
    if camera_id != "A-04":
        return False
    anchors = _load_anchors()
    if not anchors:
        return False
    probe = _frame_small(frame)
    scored = [(anchor, _frame_drift(probe, anchor.small)) for anchor in anchors]
    min_drift = min(drift for _, drift in scored)
    if min_drift > _IN_DEMO_REEL_DRIFT_MAX:
        return False
    ppe_drifts = [drift for anchor, drift in scored if anchor.is_ppe_scene]
    if ppe_drifts and min(ppe_drifts) <= _PPE_SCENE_DRIFT_MAX:
        return True
    best_anchor, _best_drift = min(scored, key=lambda item: item[1])
    return best_anchor.is_ppe_scene
