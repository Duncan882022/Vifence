"""Chạy 1 lần fine-tune YOLO trên dữ liệu vừa thu thập cho 1 task — luôn
train tiếp từ checkpoint đã promote gần nhất nếu có (continual learning),
chỉ dùng yolov8n.pt gốc khi task chưa có checkpoint nào. Sau khi train xong,
chỉ promote (đưa vào chạy thật) nếu đạt ngưỡng chất lượng tối thiểu và
không kém hẳn model đang chạy — tránh tự thay bằng bản train dở dang."""

from __future__ import annotations

import logging
import shutil
import time
from pathlib import Path

from . import dataset, registry
from .paths import RUNS_DIR, task_dir
from .tasks import TaskConfig, TASKS

logger = logging.getLogger("auto_train.trainer")

# mAP50 tối thiểu để coi model có ý nghĩa dùng thật (dưới mức này coi như
# chưa học được gì, giữ nguyên rule-based/model cũ).
_MIN_MAP50_TO_PROMOTE = 0.15
# Không promote nếu kém hẳn model đang chạy (tránh thoái lui vì 1 lần train
# dữ liệu xấu/ít).
_MAX_REGRESSION_RATIO = 0.85


def _resolve_base_weights(task_id: str, cfg: TaskConfig) -> str:
    active = registry.get_active_weights(task_id)
    return active or cfg.base_weights


def _extract_map50(run_dir: Path) -> float:
    csv_path = run_dir / "results.csv"
    if not csv_path.exists():
        return 0.0
    try:
        lines = csv_path.read_text(encoding="utf-8").strip().splitlines()
        if len(lines) < 2:
            return 0.0
        header = [h.strip() for h in lines[0].split(",")]
        last = [v.strip() for v in lines[-1].split(",")]
        for key in ("metrics/mAP50(B)", "metrics/mAP50"):
            if key in header:
                idx = header.index(key)
                return float(last[idx])
    except Exception:  # noqa: BLE001
        pass
    return 0.0


def train_task(task_id: str) -> dict:
    cfg = TASKS[task_id]
    started_at = time.time()
    n_samples = dataset.sample_count(task_id)

    yaml_path = dataset.write_dataset_yaml(task_id, cfg)
    if yaml_path is None:
        registry.record_attempt(task_id, status="skipped", detail="not_enough_samples")
        return {"status": "skipped", "reason": "not_enough_samples", "num_samples": n_samples}

    base_weights = _resolve_base_weights(task_id, cfg)
    version = registry.next_version(task_id)
    run_name = f"{task_id}_v{version}"

    logger.info(
        "[auto_train] [%s] Bắt đầu train v%s — %d ảnh, base=%s, epochs=%d",
        task_id, version, n_samples, base_weights, cfg.epochs,
    )

    try:
        from ultralytics import YOLO

        model = YOLO(base_weights)
        model.train(
            data=str(yaml_path),
            epochs=cfg.epochs,
            imgsz=cfg.imgsz,
            batch=cfg.batch,
            project=str(RUNS_DIR),
            name=run_name,
            exist_ok=True,
            verbose=False,
            plots=False,
            patience=max(cfg.epochs, 5),
            # Mặc định ultralytics spawn tới 8 worker process load data — quá
            # nặng RAM/CPU chạy song song với detect realtime trên máy
            # CPU-only, từng làm crash cả service. Giới hạn lại còn 2.
            workers=2,
        )
    except Exception as exc:  # noqa: BLE001 - lỗi train không được làm sập scheduler
        logger.error("[auto_train] [%s] Train v%s thất bại: %s", task_id, version, exc)
        registry.record_attempt(task_id, status="failed", detail=str(exc)[:300])
        return {"status": "failed", "error": str(exc)}

    run_dir = RUNS_DIR / run_name
    best_weights = run_dir / "weights" / "best.pt"
    if not best_weights.exists():
        registry.record_attempt(task_id, status="failed", detail="missing_best_weights")
        return {"status": "failed", "error": "missing_best_weights"}

    map50 = _extract_map50(run_dir)
    prev = registry.get(task_id) or {}
    prev_map50 = float((prev.get("metrics") or {}).get("map50", 0.0))
    should_promote = map50 >= _MIN_MAP50_TO_PROMOTE and map50 >= prev_map50 * _MAX_REGRESSION_RATIO
    elapsed = round(time.time() - started_at, 1)

    if not should_promote:
        detail = f"map50={map50:.3f} (prev={prev_map50:.3f})"
        registry.record_attempt(task_id, status="trained_not_promoted", detail=detail)
        return {
            "status": "trained_not_promoted",
            "map50": map50,
            "prev_map50": prev_map50,
            "elapsed_seconds": elapsed,
            "num_samples": n_samples,
        }

    versioned_path = task_dir(task_id) / f"v{version}_best.pt"
    shutil.copy2(best_weights, versioned_path)
    registry.promote(
        task_id,
        str(versioned_path.resolve()),
        version=version,
        metrics={"map50": map50},
        num_samples=n_samples,
    )
    return {
        "status": "promoted",
        "map50": map50,
        "version": version,
        "elapsed_seconds": elapsed,
        "num_samples": n_samples,
    }
