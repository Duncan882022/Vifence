"""YOLO person inference — preprocess 1280 letterbox, OpenVINO, tiled (SAHI-style)."""

from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path
from typing import TYPE_CHECKING

import numpy as np

from .config import settings

if TYPE_CHECKING:
    from ultralytics import YOLO

logger = logging.getLogger("ai_engine")

_PERSON_CLASS_ID = 0


@dataclass(frozen=True)
class PersonInferConfig:
    imgsz: int
    conf_threshold: float
    iou_threshold: float
    max_det: int
    letterbox: bool
    tiled_inference: bool
    tile_size: int
    tile_overlap: float


def person_infer_config() -> PersonInferConfig:
    return PersonInferConfig(
        imgsz=int(settings.person_imgsz),
        conf_threshold=float(settings.person_conf_threshold),
        iou_threshold=float(settings.person_iou_threshold),
        max_det=int(settings.person_max_det),
        letterbox=bool(settings.person_letterbox),
        tiled_inference=bool(settings.person_tiled_inference),
        tile_size=int(settings.person_tile_size),
        tile_overlap=float(settings.person_tile_overlap),
    )


def _backend_root() -> Path:
    return Path(__file__).resolve().parent.parent


def resolve_person_model_path() -> str:
    """Ưu tiên OpenVINO export; fallback PyTorch weights."""
    root = _backend_root()
    ov_dir = Path(settings.person_openvino_dir)
    if not ov_dir.is_absolute():
        ov_dir = root / ov_dir
    if settings.person_use_openvino:
        for name in ("yolov8s_openvino_model", "yolov8s"):
            for ext in (".xml",):
                candidate = ov_dir / f"{name}{ext}"
                if candidate.is_file():
                    logger.info("[ai_engine] OpenVINO model: %s", candidate)
                    return str(candidate)
        logger.warning(
            "[ai_engine] PERSON_USE_OPENVINO=true nhưng không thấy .xml trong %s — dùng .pt",
            ov_dir,
        )
    weights = settings.person_model_weights
    if not Path(weights).is_absolute():
        local = root / weights
        if local.is_file():
            return str(local)
    return weights


def export_person_openvino(*, imgsz: int | None = None, half: bool = False) -> Path:
    """Export yolov8s → OpenVINO (chạy một lần trên server CPU)."""
    from ultralytics import YOLO

    cfg = person_infer_config()
    size = imgsz or cfg.imgsz
    root = _backend_root()
    weights = resolve_person_model_path()
    if weights.endswith(".xml"):
        weights = str(root / settings.person_model_weights)

    out_dir = Path(settings.person_openvino_dir)
    if not out_dir.is_absolute():
        out_dir = root / out_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    model = YOLO(weights)
    exported = model.export(format="openvino", imgsz=size, half=half)
    logger.info("[ai_engine] Exported OpenVINO → %s", exported)
    return Path(str(exported))


class YoloPersonEngine:
    """Single shared YOLO — letterbox 1280, conf/iou thấp cho đám đông / xa."""

    def __init__(self, conf_threshold: float | None = None):
        self._cfg = person_infer_config()
        self.conf_threshold = (
            float(conf_threshold) if conf_threshold is not None else self._cfg.conf_threshold
        )
        self.ready = False
        self._model: YOLO | None = None
        self._error: str | None = None
        self.model_path: str | None = None

    def load(self) -> None:
        try:
            from ultralytics import YOLO

            path = resolve_person_model_path()
            logger.info(
                "[ai_engine] Loading person model %s (imgsz=%s conf=%.2f iou=%.2f)",
                path,
                self._cfg.imgsz,
                self.conf_threshold,
                self._cfg.iou_threshold,
            )
            self._model = YOLO(path)
            self.model_path = path
            self.ready = True
        except Exception as exc:  # noqa: BLE001
            self._error = str(exc)
            self.ready = False
            logger.error("[ai_engine] Load failed: %s", exc)

    def predict_raw(
        self,
        frame: np.ndarray,
        *,
        conf: float | None = None,
        iou: float | None = None,
    ) -> list[tuple[list[float], float]]:
        if not self.ready or self._model is None:
            return []

        threshold = self.conf_threshold if conf is None else conf
        nms_iou = self._cfg.iou_threshold if iou is None else iou

        if self._cfg.tiled_inference:
            return self._predict_tiled(frame, conf=threshold, iou=nms_iou)

        return self._predict_single(frame, conf=threshold, iou=nms_iou)

    def _predict_kwargs(self, *, conf: float, iou: float) -> dict:
        kwargs: dict = {
            "conf": conf,
            "iou": iou,
            "verbose": False,
            "imgsz": self._cfg.imgsz,
            "max_det": self._cfg.max_det,
        }
        # Ultralytics mặc định letterbox; tắt rõ khi cần (không khuyến khích).
        if not self._cfg.letterbox:
            kwargs["rect"] = True
        return kwargs

    def _predict_single(
        self,
        frame: np.ndarray,
        *,
        conf: float,
        iou: float,
    ) -> list[tuple[list[float], float]]:
        assert self._model is not None
        results = self._model.predict(frame, **self._predict_kwargs(conf=conf, iou=iou))
        return _parse_person_boxes(results)

    def _predict_tiled(
        self,
        frame: np.ndarray,
        *,
        conf: float,
        iou: float,
    ) -> list[tuple[list[float], float]]:
        """Slice inference — bắt người nhỏ ở xa (SAHI-style, không phụ thuộc package ngoài)."""
        h, w = frame.shape[:2]
        tile = max(320, self._cfg.tile_size)
        overlap = min(max(self._cfg.tile_overlap, 0.05), 0.45)
        stride = max(int(tile * (1.0 - overlap)), tile // 2)

        merged: list[tuple[list[float], float]] = []
        for y0 in range(0, max(h - 1, 1), stride):
            for x0 in range(0, max(w - 1, 1), stride):
                y1 = min(y0 + tile, h)
                x1 = min(x0 + tile, w)
                if y1 - y0 < 32 or x1 - x0 < 32:
                    continue
                crop = frame[y0:y1, x0:x1]
                for bbox, score in self._predict_single(crop, conf=conf, iou=iou):
                    merged.append(
                        ([bbox[0] + x0, bbox[1] + y0, bbox[2] + x0, bbox[3] + y0], score)
                    )
                if x1 >= w:
                    break
            if y1 >= h:
                break

        return _nms_person_boxes(merged, iou_threshold=iou)

    @property
    def error(self) -> str | None:
        return self._error


def _parse_person_boxes(results) -> list[tuple[list[float], float]]:
    if not results or results[0].boxes is None:
        return []
    out: list[tuple[list[float], float]] = []
    for box in results[0].boxes:
        if int(box.cls[0]) != _PERSON_CLASS_ID:
            continue
        x1, y1, x2, y2 = [float(v) for v in box.xyxy[0]]
        out.append(([x1, y1, x2, y2], float(box.conf[0])))
    return out


def _box_iou(a: list[float], b: list[float]) -> float:
    ix1 = max(a[0], b[0])
    iy1 = max(a[1], b[1])
    ix2 = min(a[2], b[2])
    iy2 = min(a[3], b[3])
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0
    inter = (ix2 - ix1) * (iy2 - iy1)
    area_a = max(0.0, a[2] - a[0]) * max(0.0, a[3] - a[1])
    area_b = max(0.0, b[2] - b[0]) * max(0.0, b[3] - b[1])
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0.0


def _nms_person_boxes(
    boxes: list[tuple[list[float], float]],
    *,
    iou_threshold: float,
) -> list[tuple[list[float], float]]:
    if len(boxes) <= 1:
        return boxes
    ranked = sorted(boxes, key=lambda item: item[1], reverse=True)
    kept: list[tuple[list[float], float]] = []
    for candidate, score in ranked:
        if any(_box_iou(candidate, kept_box) >= iou_threshold for kept_box, _ in kept):
            continue
        kept.append((candidate, score))
    return kept
