"""Demo ATGT Cam A-03 — xe + vượt tốc độ + làn phân cách cứng/mềm."""

from __future__ import annotations

import json
import logging
from pathlib import Path

import cv2
import numpy as np

from .atgt_plate_reader import read_vehicle_plate, _normalize_plate
from .schemas import Detection

logger = logging.getLogger("atgt_demo")

_DEMO_DIR = Path(__file__).resolve().parent.parent / "data" / "cam03_atgt_demo"
_LABELS_PATH = _DEMO_DIR / "labels.json"
_CACHE: list[dict] | None = None

_VEHICLE_CONF = 0.93
_SPEEDING_CONF = 0.91
_MEDIAN_CONF = 0.88
_NO_SOFT_MEDIAN_CONF = 0.86


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
        logger.warning("[atgt-demo] Không đọc được labels.json: %s", exc)
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
            "vehicles": entry.get("vehicles", {}),
            "has_soft_median": bool(entry.get("has_soft_median", False)),
        })

    _CACHE = loaded
    if loaded:
        logger.info("[atgt-demo] Sẵn sàng %d frame hiệu chuẩn Cam A-03.", len(loaded))
    return loaded


def _scale_bbox(box: list, sx: float, sy: float) -> list[float]:
    x1, y1, x2, y2 = [int(v) for v in box]
    return [float(x1 * sx), float(y1 * sy), float(x2 * sx), float(y2 * sy)]


def _vehicle_meta(vehicles: dict, key: str) -> dict[str, str | list[float] | None]:
    raw = vehicles.get(key) if isinstance(vehicles, dict) else None
    if not isinstance(raw, dict):
        return {"type": None, "plate": None, "plate_box_rel": None}
    rel = raw.get("plate_box_rel")
    plate_box_rel = rel if isinstance(rel, list) and len(rel) == 4 else None
    return {
        "type": raw.get("type"),
        "plate": raw.get("plate"),
        "plate_box_rel": plate_box_rel,
    }


def _apply_vehicle_plate(
    frame: np.ndarray,
    bbox: list[float],
    meta: dict[str, str | list[float] | None],
) -> tuple[str | None, str | None, str | None]:
    rel = meta.get("plate_box_rel")
    plate_box_rel = rel if isinstance(rel, list) else None
    plate = read_vehicle_plate(frame, bbox, plate_box_rel=plate_box_rel)
    if not plate:
        calibrated = meta.get("plate")
        if isinstance(calibrated, str) and calibrated.strip():
            plate = _normalize_plate(calibrated) or calibrated.strip()
    vtype = meta.get("type") if isinstance(meta.get("type"), str) else None
    vehicle_label = f"Ô tô · {plate}" if plate else "Ô tô"
    return plate, vtype, vehicle_label


def _detections_from_boxes(
    frame: np.ndarray,
    boxes: dict,
    has_soft_median: bool,
    sx: float,
    sy: float,
    vehicles: dict | None = None,
) -> list[Detection]:
    detections: list[Detection] = []
    vehicle_keys = sorted(k for k in boxes if k.startswith("vehicle"))
    for key in vehicle_keys:
        bbox = _scale_bbox(boxes[key], sx, sy)
        meta = _vehicle_meta(vehicles or {}, key)
        plate, vtype, vehicle_label = _apply_vehicle_plate(frame, bbox, meta)
        detections.append(
            Detection(
                behavior="vehicle",
                label=vehicle_label,
                confidence=_VEHICLE_CONF,
                bbox=bbox,
                vehicle_plate=plate,
                vehicle_type=vtype,
            )
        )
        detections.append(
            Detection(
                behavior="speeding",
                label="Phương tiện vượt quá tốc độ quy định",
                confidence=_SPEEDING_CONF,
                bbox=bbox,
                vehicle_plate=plate,
                vehicle_type=vtype,
            )
        )
    if "hard_median" in boxes:
        bbox = _scale_bbox(boxes["hard_median"], sx, sy)
        detections.append(
            Detection(
                behavior="hard_median",
                label="Làn phân cách cứng",
                confidence=_MEDIAN_CONF,
                bbox=bbox,
            )
        )
    if "soft_median" in boxes:
        bbox = _scale_bbox(boxes["soft_median"], sx, sy)
        detections.append(
            Detection(
                behavior="soft_median",
                label="Phân cách mềm",
                confidence=_MEDIAN_CONF,
                bbox=bbox,
            )
        )

    has_lane = any(d.behavior in ("hard_median", "soft_median") for d in detections)
    if not has_lane:
        lane_box = boxes.get("hard_median") or boxes.get("no_soft_median") or boxes.get("traffic_lane")
        if lane_box:
            bbox = _scale_bbox(lane_box, sx, sy)
            detections.append(
                Detection(
                    behavior="no_soft_median",
                    label="Không tổ chức phân làn, luồng giao thông",
                    confidence=_NO_SOFT_MEDIAN_CONF,
                    bbox=bbox,
                )
            )
    return detections


def match_demo_detections(frame: np.ndarray, camera_id: str) -> list[Detection] | None:
    if camera_id != "A-03":
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
        detections = _detections_from_boxes(
            frame,
            entry["boxes"],
            bool(entry.get("has_soft_median", False)),
            sx,
            sy,
            entry.get("vehicles", {}),
        )
        return detections if detections else None

    return None
