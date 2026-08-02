import json
import logging
import threading
import time
from collections import deque
from pathlib import Path

import cv2
import numpy as np

from .schemas import Detection, ViolationEvent

logger = logging.getLogger("events")

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
SNAPSHOT_DIR = DATA_DIR / "snapshots"
EVENTS_FILE = DATA_DIR / "events.jsonl"


class Debouncer:
    """Chống nhấp nháy: chỉ xác nhận sự kiện khi có đủ số lần detect dương
    tính liên tiếp trong 1 cửa sổ trượt, cộng thêm cooldown sau khi đã xác
    nhận để không tạo hàng loạt event trùng cho cùng 1 lần vi phạm."""

    def __init__(self, hits: int, window: int, cooldown_seconds: float):
        self.hits_required = hits
        self.window = deque(maxlen=window)
        self.cooldown_seconds = cooldown_seconds
        self._last_confirmed_at: float = 0.0

    def register(self, hit: bool) -> bool:
        self.window.append(hit)
        if sum(self.window) < self.hits_required:
            return False
        now = time.time()
        if now - self._last_confirmed_at < self.cooldown_seconds:
            return False
        self._last_confirmed_at = now
        return True


class EventStore:
    """Lưu event trong RAM + append ra file JSONL, kèm snapshot ảnh."""

    def __init__(self, max_in_memory: int = 200):
        self._events: deque[ViolationEvent] = deque(maxlen=max_in_memory)
        self._lock = threading.Lock()
        SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)

    def add(self, detection: Detection, frame: np.ndarray) -> ViolationEvent:
        event = ViolationEvent.from_detection(detection, snapshot_file=None)
        snapshot_name = f"{event.id}.jpg"
        snapshot_path = SNAPSHOT_DIR / snapshot_name
        annotated = self._draw_bbox(frame, detection)
        cv2.imwrite(str(snapshot_path), annotated)
        event.snapshot_file = snapshot_name

        with self._lock:
            self._events.appendleft(event)
        self._append_to_disk(event)
        logger.info(
            "Sự kiện mới: %s (%s) conf=%.2f", event.scenario_name, event.id, event.confidence
        )
        return event

    @staticmethod
    def _draw_bbox(frame: np.ndarray, detection: Detection) -> np.ndarray:
        annotated = frame.copy()
        x1, y1, x2, y2 = [int(v) for v in detection.bbox]
        color = (0, 140, 255) if detection.behavior == "smoking" else (0, 0, 255)
        cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
        label = f"{detection.label} {detection.confidence:.2f}"
        cv2.putText(
            annotated, label, (x1, max(y1 - 8, 12)),
            cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2,
        )
        return annotated

    def _append_to_disk(self, event: ViolationEvent) -> None:
        try:
            with open(EVENTS_FILE, "a", encoding="utf-8") as f:
                f.write(event.model_dump_json() + "\n")
        except OSError as exc:
            logger.warning("Không ghi được events.jsonl: %s", exc)

    def list_events(self, limit: int = 50) -> list[ViolationEvent]:
        with self._lock:
            return list(self._events)[:limit]
