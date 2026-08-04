"""Ghi dữ liệu train tự động ra định dạng YOLO chuẩn (ảnh + .txt nhãn theo
class-id, cx, cy, w, h chuẩn hoá 0-1) — nhãn được sinh từ chính detector
hiện tại (pseudo-label), không cần gán tay."""

from __future__ import annotations

import logging
import random
import time
import uuid
from pathlib import Path

import cv2
import numpy as np

from .paths import task_dir
from .tasks import TaskConfig

logger = logging.getLogger("auto_train.dataset")


def _bbox_to_yolo_line(
    cls_id: int,
    box: tuple[float, float, float, float],
    w: int,
    h: int,
) -> str | None:
    x1, y1, x2, y2 = box
    x1, x2 = max(0.0, min(x1, w)), max(0.0, min(x2, w))
    y1, y2 = max(0.0, min(y1, h)), max(0.0, min(y2, h))
    bw, bh = x2 - x1, y2 - y1
    if bw < 4 or bh < 4:
        return None
    cx, cy = (x1 + x2) / 2.0, (y1 + y2) / 2.0
    return f"{cls_id} {cx / w:.6f} {cy / h:.6f} {bw / w:.6f} {bh / h:.6f}"


def write_sample(
    task_id: str,
    cfg: TaskConfig,
    frame: np.ndarray,
    boxes: list[tuple[str, float, float, float, float]],
) -> bool:
    """Lưu 1 frame + nhãn pseudo-label. `boxes`: (class_name, x1, y1, x2, y2)
    theo pixel của `frame` (không phải đã scale về frame gốc)."""
    d = task_dir(task_id)
    h, w = frame.shape[:2]
    lines: list[str] = []
    for cls_name, x1, y1, x2, y2 in boxes:
        if cls_name not in cfg.classes:
            continue
        cls_id = cfg.classes.index(cls_name)
        line = _bbox_to_yolo_line(cls_id, (x1, y1, x2, y2), w, h)
        if line:
            lines.append(line)

    stem = f"{int(time.time() * 1000)}_{uuid.uuid4().hex[:6]}"
    img_path = d / "images" / f"{stem}.jpg"
    label_path = d / "labels" / f"{stem}.txt"
    ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 88])
    if not ok:
        return False
    img_path.write_bytes(buf.tobytes())
    label_path.write_text("\n".join(lines), encoding="utf-8")
    return True


def sample_count(task_id: str) -> int:
    d = task_dir(task_id)
    return sum(1 for _ in (d / "images").glob("*.jpg"))


def prune_if_over_capacity(task_id: str, *, capacity: int = 4000) -> None:
    """Giới hạn dung lượng dataset — khi vượt cap, loại bớt ảnh cũ nhất."""
    d = task_dir(task_id)
    images = sorted((d / "images").glob("*.jpg"), key=lambda p: p.stat().st_mtime)
    excess = len(images) - capacity
    if excess <= 0:
        return
    for p in images[:excess]:
        label = d / "labels" / f"{p.stem}.txt"
        p.unlink(missing_ok=True)
        label.unlink(missing_ok=True)


def write_dataset_yaml(
    task_id: str,
    cfg: TaskConfig,
    *,
    val_ratio: float = 0.15,
    seed: int = 42,
) -> Path | None:
    """Tạo train.txt/val.txt (split ngẫu nhiên cố định seed) + dataset.yaml
    cho ultralytics. Trả None nếu chưa đủ ảnh để train có ý nghĩa."""
    d = task_dir(task_id)
    images = sorted((d / "images").glob("*.jpg"))
    images = [p for p in images if (d / "labels" / f"{p.stem}.txt").exists()]
    if len(images) < 8:
        return None

    rng = random.Random(seed)
    shuffled = images[:]
    rng.shuffle(shuffled)
    n_val = max(2, int(len(shuffled) * val_ratio))
    val_files = shuffled[:n_val]
    train_files = shuffled[n_val:]
    if not train_files:
        train_files, val_files = shuffled, shuffled[: max(2, len(shuffled) // 4)]

    (d / "train.txt").write_text(
        "\n".join(str(p.resolve()) for p in train_files), encoding="utf-8",
    )
    (d / "val.txt").write_text(
        "\n".join(str(p.resolve()) for p in val_files), encoding="utf-8",
    )

    names_block = "\n".join(f"  {i}: {name}" for i, name in enumerate(cfg.classes))
    yaml_text = (
        f"train: {(d / 'train.txt').resolve()}\n"
        f"val: {(d / 'val.txt').resolve()}\n"
        f"names:\n{names_block}\n"
    )
    yaml_path = d / "dataset.yaml"
    yaml_path.write_text(yaml_text, encoding="utf-8")
    return yaml_path
