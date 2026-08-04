"""Load + cache model đã được auto-train (nếu registry đã promote checkpoint
nào cho task đó) và chạy predict — pipeline hiện tại (Cam 03/04, lửa, hút
thuốc) gọi vào đây trước, chỉ fallback rule-based/model gốc khi chưa có
model tự train hoặc model không tự tin."""

from __future__ import annotations

import logging
import threading
import time

import numpy as np

from ..config import settings
from . import registry
from .tasks import TASKS

logger = logging.getLogger("auto_train.inference")

_cache: dict[str, dict] = {}
_lock = threading.Lock()
_RECHECK_SECONDS = 60.0


def get_model(task_id: str):
    """Trả về `ultralytics.YOLO` đã auto-train cho task, tự reload khi
    registry đổi active_weights (model mới được promote). Trả None nếu chưa
    có checkpoint nào — lúc đó caller tự fallback."""
    if not settings.auto_train_enabled:
        return None
    with _lock:
        entry = _cache.get(task_id)
        now = time.time()
        if entry and now - entry["checked_at"] < _RECHECK_SECONDS:
            return entry["model"]

        active_path = registry.get_active_weights(task_id)
        if entry and entry.get("path") == active_path:
            entry["checked_at"] = now
            return entry["model"]

        if not active_path:
            _cache[task_id] = {"model": None, "path": None, "checked_at": now}
            return None

        try:
            from ultralytics import YOLO

            model = YOLO(active_path)
            _cache[task_id] = {"model": model, "path": active_path, "checked_at": now}
            logger.info("[%s] Đã load model auto-train: %s", task_id, active_path)
            return model
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "[%s] Không load được model auto-train '%s': %s", task_id, active_path, exc,
            )
            _cache[task_id] = {"model": None, "path": None, "checked_at": now}
            return None


def predict_boxes(
    task_id: str,
    frame: np.ndarray,
    *,
    conf_threshold: float | None = None,
) -> list[tuple[str, float, float, float, float, float]]:
    """Trả [(class_name, x1, y1, x2, y2, confidence), ...] từ model tự train,
    hoặc [] nếu chưa có model / model lỗi (fail-safe, không raise)."""
    if not settings.auto_train_enabled:
        return []
    model = get_model(task_id)
    if model is None:
        return []
    cfg = TASKS[task_id]
    conf = conf_threshold if conf_threshold is not None else cfg.runtime_conf_threshold
    try:
        results = model.predict(frame, conf=conf, verbose=False)
    except Exception as exc:  # noqa: BLE001
        logger.warning("[%s] Lỗi predict model auto-train: %s", task_id, exc)
        return []
    if not results or results[0].boxes is None:
        return []

    out: list[tuple[str, float, float, float, float, float]] = []
    names = results[0].names
    for box in results[0].boxes:
        cls_id = int(box.cls[0])
        label = names.get(cls_id, cfg.classes[cls_id] if cls_id < len(cfg.classes) else str(cls_id))
        if label not in cfg.classes:
            continue
        confidence = float(box.conf[0])
        x1, y1, x2, y2 = [float(v) for v in box.xyxy[0]]
        out.append((label, x1, y1, x2, y2, confidence))
    return out
