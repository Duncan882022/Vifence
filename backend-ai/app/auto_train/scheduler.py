"""Vòng lặp nền — train theo cửa sổ cố định (mặc định 2 lần/ngày) khi đủ
ảnh mới kể từ lần train trước."""

from __future__ import annotations

import logging
import threading
import time

from ..config import settings
from . import dataset, registry, trainer
from .schedule_windows import in_schedule_window, next_schedule_window, parse_schedule_hours
from .tasks import TASKS

logger = logging.getLogger("auto_train.scheduler")


class AutoTrainScheduler:
    """CHỈ cho phép 1 job train chạy tại 1 thời điểm — tránh OOM trên VPS CPU."""

    def __init__(self, check_interval_seconds: float | None = None):
        self.check_interval_seconds = check_interval_seconds
        self._running = False
        self._thread: threading.Thread | None = None
        self._active_task: str | None = None
        self._lock = threading.Lock()
        self._last_result: dict[str, dict] = {}

    def _interval(self) -> float:
        return self.check_interval_seconds or settings.auto_train_check_interval_seconds

    def _schedule_hours(self) -> list[int]:
        return parse_schedule_hours(settings.auto_train_schedule_hours_local)

    def _uses_schedule(self) -> bool:
        return bool(self._schedule_hours())

    def _in_window(self, now: float | None = None) -> bool:
        return in_schedule_window(
            now or time.time(),
            schedule_hours=self._schedule_hours(),
            tz_offset_hours=settings.auto_train_schedule_tz_offset_hours,
            window_minutes=settings.auto_train_schedule_window_minutes,
        )

    def start(self) -> None:
        if not settings.auto_train_enabled:
            logger.info("[auto_train] Scheduler tắt — AUTO_TRAIN_ENABLED=false.")
            return
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()
        hours = settings.auto_train_schedule_hours_local or "legacy"
        logger.info(
            "[auto_train] Scheduler khởi động — poll %.0fs · lịch %s (UTC%+d, cửa sổ %.0f phút).",
            self._interval(),
            hours,
            settings.auto_train_schedule_tz_offset_hours,
            settings.auto_train_schedule_window_minutes,
        )

    def stop(self) -> None:
        self._running = False

    def _loop(self) -> None:
        while self._running:
            if self._uses_schedule() and not self._in_window():
                time.sleep(self._interval())
                continue
            for task_id, cfg in TASKS.items():
                try:
                    self._maybe_train(task_id, cfg)
                except Exception as exc:  # noqa: BLE001
                    logger.error("[auto_train] [%s] Lỗi kiểm tra: %s", task_id, exc)
            time.sleep(self._interval())

    def _has_enough_new_samples(self, task_id: str, cfg) -> bool:
        entry = registry.get(task_id) or {}
        if entry.get("samples_at_last_attempt") is None:
            return dataset.sample_count(task_id) >= cfg.min_new_samples
        delta = registry.new_samples_since_attempt(task_id)
        threshold = settings.auto_train_min_new_samples_delta
        return delta >= threshold

    def _min_interval_ok(self, task_id: str, cfg) -> bool:
        entry = registry.get(task_id) or {}
        last_attempt_at = entry.get("last_attempt_at") or entry.get("trained_at") or 0.0
        min_gap = (
            settings.auto_train_min_interval_seconds
            if self._uses_schedule()
            else cfg.min_interval_seconds
        )
        return time.time() - last_attempt_at >= min_gap

    def _maybe_train(self, task_id: str, cfg) -> None:
        with self._lock:
            if self._active_task is not None:
                return
        if self._uses_schedule() and not self._in_window():
            return
        if not self._min_interval_ok(task_id, cfg):
            return
        if not self._has_enough_new_samples(task_id, cfg):
            return
        logger.info(
            "[auto_train] [%s] Đủ điều kiện train — samples=%d, delta=%d",
            task_id,
            dataset.sample_count(task_id),
            registry.new_samples_since_attempt(task_id),
        )
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
        now = time.time()
        hours = self._schedule_hours()
        out: dict = {
            "enabled": True,
            "schedule_hours_local": settings.auto_train_schedule_hours_local,
            "schedule_tz_offset_hours": settings.auto_train_schedule_tz_offset_hours,
            "schedule_window_minutes": settings.auto_train_schedule_window_minutes,
            "in_training_window": self._in_window(now),
            "next_window": next_schedule_window(
                now,
                schedule_hours=hours,
                tz_offset_hours=settings.auto_train_schedule_tz_offset_hours,
            ) if hours else None,
            "min_new_samples_delta": settings.auto_train_min_new_samples_delta,
            "min_interval_seconds": settings.auto_train_min_interval_seconds,
            "active_training_task": self._active_task,
        }
        for task_id, cfg in TASKS.items():
            entry = registry.get(task_id) or {}
            out[task_id] = {
                "classes": cfg.classes,
                "samples_collected": dataset.sample_count(task_id),
                "new_samples_since_last_attempt": registry.new_samples_since_attempt(task_id),
                "min_new_samples": cfg.min_new_samples,
                "min_new_samples_delta": settings.auto_train_min_new_samples_delta,
                "training_now": task_id == self._active_task,
                "active_version": entry.get("version"),
                "active_metrics": entry.get("metrics"),
                "trained_at": entry.get("trained_at"),
                "samples_at_last_attempt": entry.get("samples_at_last_attempt"),
                "last_attempt_status": entry.get("last_attempt_status"),
                "last_attempt_at": entry.get("last_attempt_at"),
            }
        return out


scheduler = AutoTrainScheduler()
