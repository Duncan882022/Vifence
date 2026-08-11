#!/usr/bin/env python3
"""Seed dataset safety_mesh_cover — lưới xanh Cam A-03 (intro mesh 0–5s + augment)."""

from __future__ import annotations

import sys
import uuid
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.auto_train.dataset import write_dataset_yaml  # noqa: E402
from app.auto_train.paths import task_dir  # noqa: E402
from app.auto_train.tasks import TASKS  # noqa: E402
from app.mesh_analyzer import mesh_cover_boxes_from_frame  # noqa: E402

_VIDEO_CANDIDATES = [
    ROOT.parent / "public" / "camera-feeds" / "ttdv-a-cam03-test.mp4",
    ROOT.parent / "docs" / "camera-feeds" / "ttdv-a-cam03-test.mp4",
    ROOT / "data" / "cam03-mesh-demo.jpg",
]
_MESH_INTRO_SECONDS = 5.0
_TARGET_SAMPLES = 180


def _yolo_line(cls_id: int, box: tuple[float, float, float, float], w: int, h: int) -> str:
    x1, y1, x2, y2 = box
    cx, cy = (x1 + x2) / 2.0, (y1 + y2) / 2.0
    bw, bh = x2 - x1, y2 - y1
    return f"{cls_id} {cx / w:.6f} {cy / h:.6f} {bw / w:.6f} {bh / h:.6f}"


def _write_sample(frame: np.ndarray, mesh_boxes: list[tuple[float, float, float, float]]) -> bool:
    if not mesh_boxes:
        return False
    h, w = frame.shape[:2]
    lines = [_yolo_line(0, box, w, h) for box in mesh_boxes]
    d = task_dir("safety_mesh_cover")
    stem = f"seed_{uuid.uuid4().hex[:8]}"
    img_path = d / "images" / f"{stem}.jpg"
    label_path = d / "labels" / f"{stem}.txt"
    ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
    if not ok:
        return False
    img_path.write_bytes(buf.tobytes())
    label_path.write_text("\n".join(lines), encoding="utf-8")
    return True


def _variants(frame: np.ndarray) -> list[np.ndarray]:
    out = [frame]
    out.append(cv2.convertScaleAbs(frame, alpha=1.08, beta=10))
    out.append(cv2.convertScaleAbs(frame, alpha=0.92, beta=-8))
    out.append(cv2.flip(frame, 1))
    h, w = frame.shape[:2]
    for scale in (0.88, 1.12):
        nw, nh = int(w * scale), int(h * scale)
        if nw < 64 or nh < 64:
            continue
        resized = cv2.resize(frame, (nw, nh))
        out.append(resized)
    return out


def _seed_from_video(path: Path) -> int:
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        return 0
    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    max_frame = int(_MESH_INTRO_SECONDS * fps)
    count = 0
    idx = 0
    while idx < max_frame:
        ok, frame = cap.read()
        if not ok:
            break
        if idx % 2 == 0:
            boxes = mesh_cover_boxes_from_frame(frame, camera_id="A-03")
            for variant in _variants(frame):
                vboxes = mesh_cover_boxes_from_frame(variant, camera_id="A-03") or boxes
                if _write_sample(variant, vboxes):
                    count += 1
        idx += 1
    cap.release()
    return count


def _seed_from_image(path: Path) -> int:
    frame = cv2.imread(str(path))
    if frame is None:
        return 0
    count = 0
    boxes = mesh_cover_boxes_from_frame(frame, camera_id="A-03")
    for variant in _variants(frame):
        vboxes = mesh_cover_boxes_from_frame(variant, camera_id="A-03") or boxes
        if _write_sample(variant, vboxes):
            count += 1
    return count


def main() -> None:
    task_dir("safety_mesh_cover")
    total_writes = 0
    for candidate in _VIDEO_CANDIDATES:
        if not candidate.is_file():
            continue
        if candidate.suffix.lower() in {".jpg", ".jpeg", ".png"}:
            total_writes += _seed_from_image(candidate)
        else:
            total_writes += _seed_from_video(candidate)

    images = list((task_dir("safety_mesh_cover") / "images").glob("*.jpg"))
    if len(images) < _TARGET_SAMPLES:
        print(f"⚠ Chỉ có {len(images)} ảnh — cần ≥{_TARGET_SAMPLES} để train tối nay.")

    cfg = TASKS["safety_mesh_cover"]
    yaml_path = write_dataset_yaml("safety_mesh_cover", cfg)
    print(f"Seeded {total_writes} writes — total images: {len(images)}, yaml: {yaml_path}")


if __name__ == "__main__":
    main()
