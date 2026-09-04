"""YOLOv8n COCO — phát hiện người (class person)."""

from __future__ import annotations

import logging

import numpy as np
from ultralytics import YOLO

from ..schemas import Detection

logger = logging.getLogger("person_detector")

_PERSON_CLASS_ID = 0


class PersonDetector:
    behavior = "person"
    name = "person-yolo"

    def __init__(self, conf_threshold: float = 0.45, weights: str = "yolov8n.pt"):
        self.conf_threshold = conf_threshold
        self.weights = weights
        self.ready = False
        self._model: YOLO | None = None
        self._error: str | None = None

    def load(self) -> None:
        try:
            logger.info("[person] Đang tải %s (COCO) cho Person Detection...", self.weights)
            self._model = YOLO(self.weights)
            self.ready = True
            logger.info("[person] Model %s sẵn sàng.", self.weights)
        except Exception as exc:  # noqa: BLE001
            self._error = str(exc)
            self.ready = False
            logger.error("[person] Không load được YOLOv8n: %s", exc)

    def predict(self, frame: np.ndarray, *, conf: float | None = None) -> list[Detection]:
        if not self.ready or self._model is None:
            return []

        threshold = self.conf_threshold if conf is None else conf
        results = self._model.predict(
            frame,
            conf=threshold,
            verbose=False,
            imgsz=1024,
            max_det=300,
            iou=0.50,
        )
        if not results or results[0].boxes is None:
            return []

        detections: list[Detection] = []
        for box in results[0].boxes:
            if int(box.cls[0]) != _PERSON_CLASS_ID:
                continue
            x1, y1, x2, y2 = [float(v) for v in box.xyxy[0]]
            detections.append(
                Detection(
                    behavior="person",
                    label="person",
                    confidence=float(box.conf[0]),
                    bbox=[x1, y1, x2, y2],
                )
            )
        return detections
