"""Vòng lặp nền — định kỳ kiểm tra từng task (Cam 03 vật tư/bùn/nước, Cam 04
máy móc, lửa, hút thuốc) đã thu thập đủ dữ liệu mới chưa, đủ thì tự train +
tự promote nếu đạt chất lượng — không cần người vận hành bấm gì."""

from __future__ import annotations

import logging
import threading
import time

from ..config import settings
from . import dataset, registry, trainer
from .tasks import TASKS

logger = logging.getLogger("auto_train.scheduler")


class AutoTrainScheduler:
    """CHỈ cho phép 1 job train chạy tại 1 thời điểm, bất kể task nào — chạy
    2 job train YOLO song song (mỗi job tự spawn nhiều dataloader worker) đã
    từng làm crash cả tiến trình backend (tràn RAM/CPU trên máy CPU-only),
    kéo sập luôn cả camera + detect realtime. Train tốn nhiều thời gian
    (~30-60 phút/vòng trên CPU) không sao vì chạy nền, không chặn detect —
    nhưng phải nối tiếp nhau, không được chạy đồng thời."""

    def __init__(self, check_interval_seconds: float = 120.0):
        self.check_interval_seconds = check_interval_seconds
        self._running = False
        self._thread: threading.Thread | None = None
        self._active_task: str | None = None
        self._lock = threading.Lock()
        self._last_result: dict[str, dict] = {}

    def start(self) -> None:
        if not settings.auto_train_enabled:
            logger.info("[auto_train] Scheduler tắt — AUTO_TRAIN_ENABLED=false.")
            return
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        logger.info(
            "[auto_train] Scheduler khởi động — kiểm tra dữ liệu mỗi %.0fs.",
            self.check_interval_seconds,
        )

    def stop(self) -> None:
        self._running = False

    def _loop(self) -> None:
        while self._running:
            for task_id, cfg in TASKS.items():
                try:
                    self._maybe_train(task_id, cfg)
                except Exception as exc:  # noqa: BLE001
                    logger.error("[auto_train] [%s] Lỗi kiểm tra: %s", task_id, exc)
            time.sleep(self.check_interval_seconds)

    def _maybe_train(self, task_id: str, cfg) -> None:
        with self._lock:
            if self._active_task is not None:
                return
        entry = registry.get(task_id) or {}
        last_attempt_at = entry.get("last_attempt_at") or entry.get("trained_at") or 0.0
        if time.time() - last_attempt_at < cfg.min_interval_seconds:
            return
        if dataset.sample_count(task_id) < cfg.min_new_samples:
            return
        self.trigger(task_id, background=True)

    def trigger(self, task_id: str, *, background: bool = True) -> dict:
        if not settings.auto_train_enabled:
            return {"status": "disabled", "message": "Auto-train tạm tắt — chưa đủ video."}
        if task_id not in TASKS:
            return {"status": "error", "error": "unknown_task"}
        with self._lock:
            if self._active_task is not None:
                return {"status": "busy", "current_task": self._active_task}
            self._active_task = task_id

        def _run() -> None:
            try:
                result = trainer.train_task(task_id)
                with self._lock:
                    self._last_result[task_id] = result
                logger.info("[auto_train] [%s] Kết quả train: %s", task_id, result)
            finally:
                with self._lock:
                    self._active_task = None

        if background:
            threading.Thread(target=_run, daemon=True).start()
            return {"status": "started"}
        _run()
        return self._last_result.get(task_id, {"status": "unknown"})

    def status(self) -> dict:
        if not settings.auto_train_enabled:
            return {"enabled": False, "message": "Auto-train tạm tắt — chưa đủ video."}
        out: dict = {"enabled": True}
        for task_id, cfg in TASKS.items():
            entry = registry.get(task_id) or {}
            out[task_id] = {
                "classes": cfg.classes,
                "samples_collected": dataset.sample_count(task_id),
                "min_new_samples": cfg.min_new_samples,
                "training_now": task_id == self._active_task,
                "active_version": entry.get("version"),
                "active_metrics": entry.get("metrics"),
                "trained_at": entry.get("trained_at"),
                "last_attempt_status": entry.get("last_attempt_status"),
                "last_attempt_at": entry.get("last_attempt_at"),
            }
        return out


scheduler = AutoTrainScheduler()
