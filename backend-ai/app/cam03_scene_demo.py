"""BBox demo Cam A-03 — mesh BPTC-001 (0–5s reel) + ATGT-004 trên segment ATGT."""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import cv2
import numpy as np

from .schemas import Detection, RoadDetection
from .violation_thresholds import VIOLATION_MIN_CONFIDENCE

logger = logging.getLogger("cam03_scene_demo")

_DEMO_DIR = Path(__file__).resolve().parent.parent / "data" / "cam03_demo"
_REEL_ROOT = Path(__file__).resolve().parent.parent.parent
_FRAME_SMALL = (48, 48)
_MATCH_DRIFT_MAX = 8.0


@dataclass(frozen=True)
class _SceneAnchor:
    key: str
    small: np.ndarray
    mesh_missing: tuple[int, int, int, int] | None = None
    mesh_dirty: tuple[int, int, int, int] | None = None
    no_soft_median: tuple[int, int, int, int] | None = None


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
def _load_anchors() -> tuple[_SceneAnchor, ...]:
    labels_path = _DEMO_DIR / "labels.json"
    anchors: list[_SceneAnchor] = []

    if labels_path.is_file():
        try:
            payload = json.loads(labels_path.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            logger.warning("cam03_scene_demo: không đọc được labels.json")
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
                _SceneAnchor(
                    key=Path(str(file_name)).stem,
                    small=_frame_small(img),
                    mesh_missing=_bbox_from_raw(entry.get("mesh_missing")),
                    mesh_dirty=_bbox_from_raw(entry.get("mesh_dirty")),
                    no_soft_median=_bbox_from_raw(entry.get("no_soft_median")),
                )
            )

    for rel in (
        "public/camera-feeds/cam03-mesh-demo.jpg",
        "public/camera-feeds/cam03-atgt-scene.jpg",
    ):
        path = _REEL_ROOT / rel
        if not path.is_file():
            continue
        img = cv2.imread(str(path))
        if img is None:
            continue
        stem = path.stem
        if any(a.key.replace("-", "_") == stem.replace("-", "_") for a in anchors):
            continue
        anchors.append(_SceneAnchor(key=stem, small=_frame_small(img)))

    return tuple(anchors)


def _best_anchor(frame: np.ndarray) -> tuple[_SceneAnchor | None, float]:
    anchors = _load_anchors()
    if not anchors:
        return None, float("inf")
    probe = _frame_small(frame)
    scored = [(anchor, _frame_drift(probe, anchor.small)) for anchor in anchors]
    best_anchor, best_drift = min(scored, key=lambda item: item[1])
    if best_drift > _MATCH_DRIFT_MAX:
        return None, best_drift
    return best_anchor, best_drift


def resolve_cam03_mesh_demo(
    camera_id: str,
    frame: np.ndarray,
) -> list[RoadDetection] | None:
    """Segment mesh đầu reel → BPTC-001 thiếu + bẩn."""
    if camera_id != "A-03":
        return None
    anchor, _ = _best_anchor(frame)
    if anchor is None or (anchor.mesh_missing is None and anchor.mesh_dirty is None):
        return None

    out: list[RoadDetection] = []
    if anchor.mesh_missing:
        x1, y1, x2, y2 = anchor.mesh_missing
        out.append(
            RoadDetection(
                behavior="mesh_missing",
                label="Lưới bao che thiếu",
                scenario_id="BPTC-001",
                confidence=max(VIOLATION_MIN_CONFIDENCE, 0.88),
                bbox=[float(x1), float(y1), float(x2), float(y2)],
            )
        )
    if anchor.mesh_dirty:
        x1, y1, x2, y2 = anchor.mesh_dirty
        out.append(
            RoadDetection(
                behavior="mesh_dirty",
                label="Lưới bao che bẩn",
                scenario_id="BPTC-001",
                confidence=max(VIOLATION_MIN_CONFIDENCE, 0.86),
                bbox=[float(x1), float(y1), float(x2), float(y2)],
            )
        )
    return out


def augment_cam03_atgt_demo(
    camera_id: str,
    frame: np.ndarray,
    detections: list[Detection],
) -> list[Detection]:
    """Segment ATGT (t≈16s) — bổ sung ATGT-004 khi ML chỉ thấy soft_median."""
    if camera_id != "A-03":
        return detections
    anchor, _ = _best_anchor(frame)
    if anchor is None or anchor.no_soft_median is None:
        return detections

    x1, y1, x2, y2 = anchor.no_soft_median
    filtered = [
        d for d in detections
        if d.behavior not in {"soft_median", "hard_median"}
    ]
    has_lane_violation = any(d.behavior == "no_soft_median" for d in filtered)
    if not has_lane_violation:
        filtered.append(
            Detection(
                behavior="no_soft_median",
                label="Không tổ chức phân làn, luồng giao thông",
                confidence=max(VIOLATION_MIN_CONFIDENCE, 0.87),
                bbox=[float(x1), float(y1), float(x2), float(y2)],
            )
        )
    return filtered
