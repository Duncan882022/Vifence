"""Registry — theo dõi checkpoint tự train nào đang được dùng cho mỗi task,
kèm điểm chất lượng (mAP50) và lịch sử lần train gần nhất. File JSON đơn
giản, ghi atomic (tmp + replace) để tránh hỏng file khi scheduler + API đọc
đồng thời."""

from __future__ import annotations

import json
import logging
import threading
import time
from pathlib import Path
from typing import Any

from .paths import REGISTRY_PATH

logger = logging.getLogger("auto_train.registry")

_lock = threading.Lock()


def _read() -> dict[str, Any]:
    if not REGISTRY_PATH.exists():
        return {}
    try:
        return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        logger.warning("[auto_train] Registry lỗi định dạng — khởi tạo lại rỗng.")
        return {}


def _write(data: dict[str, Any]) -> None:
    REGISTRY_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp = REGISTRY_PATH.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(REGISTRY_PATH)


def get(task_id: str) -> dict[str, Any] | None:
    with _lock:
        return _read().get(task_id)


def get_active_weights(task_id: str) -> str | None:
    entry = get(task_id)
    if not entry:
        return None
    path = entry.get("active_weights")
    if path and Path(path).exists():
        return path
    return None


def promote(
    task_id: str,
    weights_path: str,
    *,
    version: int,
    metrics: dict,
    num_samples: int,
) -> None:
    with _lock:
        data = _read()
        entry = data.get(task_id, {})
        entry.update(
            {
                "active_weights": weights_path,
                "version": version,
                "trained_at": time.time(),
                "metrics": metrics,
                "num_samples": num_samples,
                "last_attempt_at": time.time(),
                "last_attempt_status": "promoted",
                "samples_at_last_attempt": num_samples,
            }
        )
        data[task_id] = entry
        _write(data)
    logger.info("[auto_train] Promote model '%s' v%s — metrics=%s", task_id, version, metrics)


def record_attempt(task_id: str, *, status: str, detail: str | None = None) -> None:
    """Ghi lại lần train gần nhất kể cả khi không promote (skip/fail) — để
    hiển thị status và tính lại thời điểm chờ lần thử kế tiếp."""
    from . import dataset

    with _lock:
        data = _read()
        entry = data.get(task_id, {})
        entry["last_attempt_at"] = time.time()
        entry["last_attempt_status"] = status
        entry["samples_at_last_attempt"] = dataset.sample_count(task_id)
        if detail:
            entry["last_attempt_detail"] = detail
        data[task_id] = entry
        _write(data)


def next_version(task_id: str) -> int:
    entry = get(task_id)
    return int((entry or {}).get("version", 0)) + 1


def new_samples_since_attempt(task_id: str) -> int:
    from . import dataset

    entry = get(task_id)
    if not entry or entry.get("samples_at_last_attempt") is None:
        return dataset.sample_count(task_id)
    baseline = int(entry["samples_at_last_attempt"])
    return max(0, dataset.sample_count(task_id) - baseline)


def all_status() -> dict[str, Any]:
    with _lock:
        return _read()
