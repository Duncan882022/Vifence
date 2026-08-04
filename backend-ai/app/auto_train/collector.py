"""Điểm gọi từ mọi pipeline detect hiện tại — mỗi frame chạy qua rule-based
(Cam 03/04) hoặc YOLO (lửa/hút thuốc) đều tự động được lưu lại kèm nhãn
pseudo-label do chính detector đó sinh ra, để nuôi dữ liệu train tự động.
Không bao giờ raise lỗi ra ngoài — thu thập dữ liệu là phụ, không được ảnh
hưởng luồng detect chính."""

from __future__ import annotations

import logging
import random
import threading
import time

import numpy as np

from . import dataset
from .tasks import TASKS

logger = logging.getLogger("auto_train.collector")

# Tránh ghi liên tiếp các frame gần như trùng nhau (frame gửi lên mỗi
# 150-450ms, nội dung hầu như không đổi giữa các lần gọi liên tiếp).
_MIN_GAP_SECONDS = 1.6
# % frame KHÔNG có box vẫn được lưu làm negative — tránh model chỉ học được
# "luôn luôn có vật", dẫn tới báo nhầm khi khung hình sạch.
_NEGATIVE_SAMPLE_RATE = 0.06

_last_write_at: dict[str, float] = {}
_lock = threading.Lock()


def collect(
    task_id: str,
    frame: np.ndarray,
    boxes: list[tuple[str, float, float, float, float]],
) -> None:
    cfg = TASKS.get(task_id)
    if cfg is None or frame is None:
        return

    now = time.time()
    with _lock:
        last = _last_write_at.get(task_id, 0.0)
        if now - last < _MIN_GAP_SECONDS:
            return
        has_boxes = bool(boxes)
        if not has_boxes and random.random() > _NEGATIVE_SAMPLE_RATE:
            return
        _last_write_at[task_id] = now

    try:
        written = dataset.write_sample(task_id, cfg, frame, boxes)
        if written:
            dataset.prune_if_over_capacity(task_id)
    except Exception as exc:  # noqa: BLE001
        logger.warning("[%s] Lỗi lưu sample auto-train: %s", task_id, exc)
