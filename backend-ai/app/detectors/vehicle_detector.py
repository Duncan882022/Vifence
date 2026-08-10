"""YOLOv8n COCO — phát hiện phương tiện (ô tô, xe máy, xe buýt, xe tải)."""

from __future__ import annotations

import logging

import numpy as np
from ultralytics import YOLO

from ..schemas import Detection

logger = logging.getLogger("vehicle_detector")

# class_id COCO -> (tên gốc model, nhãn tiếng Việt)
_VEHICLE_CLASS_MAP: dict[int, tuple[str, str]] = {
    2: ("car", "Ô tô"),
    3: ("motorcycle", "Xe máy"),
    5: ("bus", "Xe buýt"),
    7: ("truck", "Xe tải"),
}


class VehicleDetector:
    behavior = "vehicle"
    name = "vehicle-yolo"

    def __init__(self, conf_threshold: float = 0.42):
        self.conf_threshold = conf_threshold
        self.ready = False
        self._model: YOLO | None = None
        self._error: str | None = None

    def load(self) -> None:
        try:
            logger.info("[vehicle] Đang tải YOLOv8n (COCO) cho Vehicle Detection...")
            self._model = YOLO("yolov8n.pt")
            self.ready = True
            logger.info("[vehicle] Model sẵn sàng.")
        except Exception as exc:  # noqa: BLE001
            self._error = str(exc)
            self.ready = False
            logger.error("[vehicle] Không load được YOLOv8n: %s", exc)

    def predict(self, frame: np.ndarray) -> list[Detection]:
        if not self.ready or self._model is None:
            return []

        results = self._model.predict(frame, conf=self.conf_threshold, verbose=False)
        if not results or results[0].boxes is None:
            return []

        detections: list[Detection] = []
        for box in results[0].boxes:
            cls_id = int(box.cls[0])
            meta = _VEHICLE_CLASS_MAP.get(cls_id)
            if meta is None:
                continue
            coco_name, vi_label = meta
            x1, y1, x2, y2 = [float(v) for v in box.xyxy[0]]
            detections.append(
                Detection(
                    behavior="vehicle",
                    label=coco_name,
                    confidence=float(box.conf[0]),
                    bbox=[x1, y1, x2, y2],
                    vehicle_type=vi_label,
                )
            )
        return detections
