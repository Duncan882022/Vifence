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
_MATCH_DRIFT_MAX = 10.0
_ATGT_MATCH_DRIFT_MAX = 18.0
_ATGT_SEGMENT_START = 15.5
_ATGT_SEGMENT_END = 20.5
_MESH_SEGMENT_END = 6.0
_MESH_MATCH_DRIFT_MAX = 5.0
_MESH_REF_WIDTH = 640
_MESH_REF_HEIGHT = 640


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


def _best_mesh_anchor(frame: np.ndarray) -> tuple[_SceneAnchor | None, float]:
    pool = [a for a in _load_anchors() if a.mesh_missing or a.mesh_dirty]
    if not pool:
        return None, float("inf")
    probe = _frame_small(frame)
    anchor, drift = min(((a, _frame_drift(probe, a.small)) for a in pool), key=lambda x: x[1])
    if drift > _MESH_MATCH_DRIFT_MAX:
        return None, drift
    return anchor, drift


def _scale_anchor_bbox(
    bbox: tuple[int, int, int, int],
    frame_w: int,
    frame_h: int,
) -> list[float]:
    sx = frame_w / _MESH_REF_WIDTH
    sy = frame_h / _MESH_REF_HEIGHT
    x1, y1, x2, y2 = bbox
    return [
        float(x1 * sx),
        float(y1 * sy),
        float(x2 * sx),
        float(y2 * sy),
    ]


def _best_atgt_anchor(frame: np.ndarray) -> tuple[_SceneAnchor | None, float]:
    pool = [a for a in _load_anchors() if a.no_soft_median]
    if not pool:
        return None, float("inf")
    probe = _frame_small(frame)
    anchor, drift = min(((a, _frame_drift(probe, a.small)) for a in pool), key=lambda x: x[1])
    if drift > _ATGT_MATCH_DRIFT_MAX:
        return None, drift
    return anchor, drift


def resolve_cam03_mesh_demo(
    camera_id: str,
    frame: np.ndarray,
    *,
    source_pts_sec: float | None = None,
) -> list[RoadDetection] | None:
    """Segment mesh đầu reel (0–6s) → BPTC-001 thiếu/bẩn chỉ trong ROI lưới thật."""
    if camera_id != "A-03":
        return None
    if source_pts_sec is not None and float(source_pts_sec) >= _MESH_SEGMENT_END:
        return None

    anchor, _ = _best_mesh_anchor(frame)
    if anchor is None:
        return None

    from .mesh_analyzer import (
        bbox_inside_mesh_zone,
        _localize_mesh_dirty_bbox,
        _localize_mesh_gap_bbox,
        _mesh_dirty_stain_mask,
        _polygon_to_mask,
        _zone_bbox,
    )
    from .road_roi_config import get_mesh_zones_for_camera

    h, w = frame.shape[:2]
    mesh_zones = get_mesh_zones_for_camera(camera_id)
    zone_polygon = mesh_zones[0]["polygon"] if mesh_zones else None
    if zone_polygon is None:
        return None

    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
    roi_mask = _polygon_to_mask(zone_polygon, w, h)
    zone_box = _zone_bbox(zone_polygon, w, h)
    stain_mask = _mesh_dirty_stain_mask(hsv, roi_mask)

    out: list[RoadDetection] = []

    # Lỗ lưới — chỉ tìm trên cột lưới xanh bên trái, tránh nhầm cẩu/vùng giữa frame.
    left_mask = roi_mask.copy()
    left_mask[:, int(w * 0.35) :] = 0
    left_zone_box = [0.0, 0.0, float(w) * 0.35, zone_box[3]]
    gap_bbox = _localize_mesh_gap_bbox(
        hsv, left_mask, left_zone_box, stain_mask=stain_mask,
    )
    if gap_bbox is None and anchor.mesh_missing is not None:
        gap_bbox = _scale_anchor_bbox(anchor.mesh_missing, w, h)
    if gap_bbox is not None and bbox_inside_mesh_zone(gap_bbox, zone_polygon, w, h):
        x1, y1, x2, y2 = gap_bbox
        out.append(
            RoadDetection(
                behavior="mesh_missing",
                label="Lưới bao che thiếu",
                scenario_id="BPTC-001",
                confidence=max(VIOLATION_MIN_CONFIDENCE, 0.88),
                bbox=[float(x1), float(y1), float(x2), float(y2)],
            )
        )

    dirty_bbox = _localize_mesh_dirty_bbox(hsv, roi_mask, zone_box)
    if dirty_bbox is not None and bbox_inside_mesh_zone(dirty_bbox, zone_polygon, w, h):
        x1, y1, x2, y2 = dirty_bbox
        out.append(
            RoadDetection(
                behavior="mesh_dirty",
                label="Lưới bao che bẩn",
                scenario_id="BPTC-001",
                confidence=max(VIOLATION_MIN_CONFIDENCE, 0.86),
                bbox=[float(x1), float(y1), float(x2), float(y2)],
            )
        )

    return out or None


def augment_cam03_atgt_demo(
    camera_id: str,
    frame: np.ndarray,
    detections: list[Detection],
    *,
    source_pts_sec: float | None = None,
) -> list[Detection]:
    """Cam A-03 — có hàng rào thì không vi phạm; không hàng rào thì bổ sung ATGT-004 trên segment ATGT."""
    if camera_id != "A-03":
        return detections

    if any(d.behavior == "soft_median" for d in detections):
        return [d for d in detections if d.behavior != "no_soft_median"]

    if any(d.behavior == "no_soft_median" for d in detections):
        return detections

    in_atgt = (
        source_pts_sec is not None
        and _ATGT_SEGMENT_START <= float(source_pts_sec) <= _ATGT_SEGMENT_END
    )
    if not in_atgt:
        return detections

    from .atgt_analyzer import (
        _left_lane_missing_median,
        _missing_lane_separation_bbox,
        _roi_mask,
    )

    h, w = frame.shape[:2]
    mask = _roi_mask(camera_id, w, h)
    if mask is None:
        return detections

    lane_bbox = _left_lane_missing_median(frame, mask)
    if lane_bbox is None:
        lane_bbox = _missing_lane_separation_bbox(mask, w, h)

    anchor, drift = _best_atgt_anchor(frame)
    if lane_bbox is None and anchor is not None and anchor.no_soft_median is not None:
        if drift <= _ATGT_MATCH_DRIFT_MAX:
            lane_bbox = anchor.no_soft_median

    if lane_bbox is None:
        return detections

    x1, y1, x2, y2 = lane_bbox
    return [
        *detections,
        Detection(
            behavior="no_soft_median",
            label="Không tổ chức phân làn, phân luồng giao thông",
            confidence=max(VIOLATION_MIN_CONFIDENCE, 0.87),
            bbox=[float(x1), float(y1), float(x2), float(y2)],
        ),
    ]


def is_cam03_atgt_lane_violation_scene(
    camera_id: str,
    frame: np.ndarray,
    *,
    source_pts_sec: float | None = None,
) -> bool:
    """Luôn False — engine phải tôn trọng lane_organized, không bypass demo."""
    _ = camera_id, frame, source_pts_sec
    return False
