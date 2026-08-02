from __future__ import annotations

import logging
from typing import Optional

import numpy as np
from huggingface_hub import hf_hub_download
from ultralytics import YOLO

from ..schemas import Detection

logger = logging.getLogger("detector")


class BaseDetector:
    """Wrap 1 model YOLOv8 tải từ Hugging Face Hub.

    Thiết kế "pluggable": nếu model không tải/không load được (lỗi mạng, đổi
    repo, checkpoint không tương thích...), detector chuyển sang trạng thái
    `ready=False` và bị bỏ qua trong vòng lặp detection thay vì crash cả
    service — 2 hành vi (hút thuốc / cháy nổ) hoạt động độc lập với nhau.
    """

    behavior: str = "base"
    name: str = "base"

    def __init__(self, repo_id: str, filename: str, conf_threshold: float):
        self.repo_id = repo_id
        self.filename = filename
        self.conf_threshold = conf_threshold
        self.ready = False
        self._model: YOLO | None = None
        self._error: str | None = None

    def load(self) -> None:
        try:
            logger.info(
                "[%s] Đang tải model '%s/%s' từ Hugging Face (lần đầu sẽ cache lại)...",
                self.behavior,
                self.repo_id,
                self.filename,
            )
            weight_path = hf_hub_download(repo_id=self.repo_id, filename=self.filename)
            self._model = YOLO(weight_path)
            self.ready = True
            logger.info(
                "[%s] Model sẵn sàng. Classes: %s", self.behavior, self._model.names
            )
        except Exception as exc:  # noqa: BLE001 - muốn bắt mọi lỗi để không sập service
            self._error = str(exc)
            self.ready = False
            logger.error(
                "[%s] Không load được model '%s/%s': %s. "
                "Detector này sẽ bị vô hiệu hoá, các phần khác vẫn chạy bình thường. "
                "Sửa biến %s_MODEL_REPO / %s_MODEL_FILE trong .env để đổi model khác.",
                self.behavior,
                self.repo_id,
                self.filename,
                exc,
                self.behavior.upper(),
                self.behavior.upper(),
            )

    @property
    def error(self) -> Optional[str]:
        return self._error

    def _target_labels(self, label: str) -> bool:
        """Override để lọc bớt class không liên quan nếu model có nhiều class."""
        return True

    def _post_filter(self, frame: np.ndarray, detections: list[Detection]) -> list[Detection]:
        """Override để lọc thêm sau khi có bbox (vd chống false-positive theo
        màu sắc/vùng ảnh) — mặc định không lọc gì thêm."""
        return detections

    def predict(self, frame: np.ndarray) -> list[Detection]:
        if not self.ready or self._model is None:
            return []

        results = self._model.predict(
            frame, conf=self.conf_threshold, verbose=False
        )
        detections: list[Detection] = []
        if not results:
            return detections

        result = results[0]
        if result.boxes is None:
            return detections

        names = result.names
        for box in result.boxes:
            cls_id = int(box.cls[0])
            label = names.get(cls_id, str(cls_id))
            if not self._target_labels(label):
                continue
            confidence = float(box.conf[0])
            x1, y1, x2, y2 = [float(v) for v in box.xyxy[0]]
            detections.append(
                Detection(
                    behavior=self.behavior,
                    label=label,
                    confidence=confidence,
                    bbox=[x1, y1, x2, y2],
                )
            )
        return self._post_filter(frame, detections)
