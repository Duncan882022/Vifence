"""Person detector — facade trên ai_engine (YOLOv8s / OpenVINO / 1280 letterbox)."""

from __future__ import annotations

from .ai_engine import YoloPersonEngine, export_person_openvino, person_infer_config, resolve_person_model_path
from .schemas import Detection


class PersonDetector:
    """Phát hiện người COCO — dùng chung patrol HC-*, flycam, PPE person gate."""

    behavior = "person"
    name = "person-yolo"

    def __init__(self, conf_threshold: float | None = None):
        self._engine = YoloPersonEngine(conf_threshold=conf_threshold)
        self.conf_threshold = self._engine.conf_threshold

    @property
    def ready(self) -> bool:
        return self._engine.ready

    @property
    def error(self) -> str | None:
        return self._engine.error

    def load(self) -> None:
        self._engine.load()

    def predict(self, frame, *, conf: float | None = None) -> list[Detection]:
        raw = self._engine.predict_raw(frame, conf=conf)
        return [
            Detection(
                behavior="person",
                label="person",
                confidence=score,
                bbox=bbox,
            )
            for bbox, score in raw
        ]


__all__ = [
    "PersonDetector",
    "YoloPersonEngine",
    "export_person_openvino",
    "person_infer_config",
    "resolve_person_model_path",
]
