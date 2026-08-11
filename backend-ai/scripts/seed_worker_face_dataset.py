#!/usr/bin/env python3
"""Seed dataset worker_face — YuNet pseudo-label từ gallery + Cam A-04."""

from __future__ import annotations

import json
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
from app.detectors.face_guard import face_boxes_from_frame  # noqa: E402
from app.worker_identity.gallery import gallery_dir  # noqa: E402

_VIDEO_CANDIDATES = [
    ROOT.parent / "public" / "camera-feeds" / "ttdv-a-cam04-test.mp4",
    ROOT.parent / "docs" / "camera-feeds" / "ttdv-a-cam04-test.mp4",
]
_TARGET_SAMPLES = 100
_SAMPLE_EVERY_N = 2


def _yolo_line(cls_id: int, box: tuple[float, float, float, float], w: int, h: int) -> str:
    x1, y1, x2, y2 = box
    cx, cy = (x1 + x2) / 2.0, (y1 + y2) / 2.0
    bw, bh = x2 - x1, y2 - y1
    return f"{cls_id} {cx / w:.6f} {cy / h:.6f} {bw / w:.6f} {bh / h:.6f}"


def _write_sample(frame: np.ndarray, face_boxes: list[tuple[float, float, float, float]]) -> bool:
    if not face_boxes:
        return False
    h, w = frame.shape[:2]
    lines = [_yolo_line(0, box, w, h) for box in face_boxes]
    d = task_dir("worker_face")
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
    out.append(cv2.convertScaleAbs(frame, alpha=1.07, beta=8))
    out.append(cv2.convertScaleAbs(frame, alpha=0.93, beta=-6))
    out.append(cv2.flip(frame, 1))
    return out


def _gallery_face_box(frame: np.ndarray) -> list[tuple[float, float, float, float]]:
    """Ảnh enroll thường là crop mặt — bbox gần full frame."""
    boxes = face_boxes_from_frame(frame, score_threshold=0.35)
    if boxes:
        return boxes
    h, w = frame.shape[:2]
    m = 0.06
    return [(w * m, h * m, w * (1 - m), h * (1 - m))]


def _seed_from_gallery() -> int:
    registry = gallery_dir() / "workers.json"
    faces_dir = gallery_dir() / "faces"
    if not registry.exists():
        return 0
    rows = json.loads(registry.read_text(encoding="utf-8"))
    count = 0
    seen: set[str] = set()
    for row in rows:
        names: list[str] = []
        if row.get("face_images"):
            names.extend(str(n) for n in row["face_images"])
        elif row.get("face_image"):
            names.append(str(row["face_image"]))
        for name in names:
            if name in seen:
                continue
            seen.add(name)
            path = faces_dir / name
            if not path.is_file():
                continue
            frame = cv2.imread(str(path))
            if frame is None:
                continue
            base_boxes = _gallery_face_box(frame)
            for variant in _variants(frame):
                vboxes = face_boxes_from_frame(variant, score_threshold=0.35) or base_boxes
                if _write_sample(variant, vboxes):
                    count += 1
    return count


def _seed_from_video(path: Path) -> int:
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        return 0
    count = 0
    idx = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if idx % _SAMPLE_EVERY_N == 0:
            boxes = face_boxes_from_frame(frame, score_threshold=0.40)
            for variant in _variants(frame):
                vboxes = face_boxes_from_frame(variant, score_threshold=0.40) or boxes
                if _write_sample(variant, vboxes):
                    count += 1
        idx += 1
    cap.release()
    return count


def main() -> None:
    task_dir("worker_face")
    n_gallery = _seed_from_gallery()
    n_video = 0
    for candidate in _VIDEO_CANDIDATES:
        if candidate.is_file():
            n_video += _seed_from_video(candidate)

    images = list((task_dir("worker_face") / "images").glob("*.jpg"))
    if len(images) < _TARGET_SAMPLES:
        print(f"⚠ Chỉ có {len(images)} ảnh — cần ≥{_TARGET_SAMPLES} để train ổn.")

    cfg = TASKS["worker_face"]
    yaml_path = write_dataset_yaml("worker_face", cfg)
    print(
        f"Seeded gallery={n_gallery} video={n_video} — "
        f"total images: {len(images)}, yaml: {yaml_path}"
    )


if __name__ == "__main__":
    main()
