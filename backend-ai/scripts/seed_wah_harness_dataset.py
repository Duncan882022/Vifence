#!/usr/bin/env python3
"""Seed dataset wah_harness — dây chữ X trước/sau từ scene Cam A-04 + ảnh hiệu chuẩn."""

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
from app.wah_harness_detector import harness_bbox_from_person  # noqa: E402

_DEMO_DIR = ROOT / "data" / "cam04_wah_demo"
_LABELS_PATH = _DEMO_DIR / "labels.json"
_EXTRA_IMAGES = [
    ROOT.parent / ".cursor" / "projects" / "Users-duncannguyen-Desktop-Vifence-CMS" / "assets"
    / "Screenshot_2026-08-06_at_2.21.10_AM-69a88848-e3f5-490a-9cc6-621d359d6ca4.png",
]


def _yolo_line(cls_id: int, box: tuple[float, float, float, float], w: int, h: int) -> str:
    x1, y1, x2, y2 = box
    cx, cy = (x1 + x2) / 2.0, (y1 + y2) / 2.0
    bw, bh = x2 - x1, y2 - y1
    return f"{cls_id} {cx / w:.6f} {cy / h:.6f} {bw / w:.6f} {bh / h:.6f}"


def _write_sample(frame: np.ndarray, harness_boxes: list[tuple[float, float, float, float]]) -> None:
    h, w = frame.shape[:2]
    lines = [_yolo_line(0, box, w, h) for box in harness_boxes]
    if not lines:
        return
    d = task_dir("wah_harness")
    stem = f"seed_{uuid.uuid4().hex[:8]}"
    img_path = d / "images" / f"{stem}.jpg"
    label_path = d / "labels" / f"{stem}.txt"
    ok, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
    if not ok:
        return
    img_path.write_bytes(buf.tobytes())
    label_path.write_text("\n".join(lines), encoding="utf-8")


def _seed_from_labels() -> int:
    payload = json.loads(_LABELS_PATH.read_text(encoding="utf-8"))
    count = 0
    for entry in payload.get("frames", []):
        img_path = _DEMO_DIR / entry["file"]
        frame = cv2.imread(str(img_path))
        if frame is None:
            continue
        boxes = entry.get("boxes", {})
        harness = entry.get("harness", {})
        person_keys = sorted(k for k in boxes if k.startswith("person"))
        harness_boxes: list[tuple[float, float, float, float]] = []
        for key in person_keys:
            if not harness.get(key):
                continue
            x1, y1, x2, y2 = boxes[key]
            pb = (float(x1), float(y1), float(x2), float(y2))
            harness_boxes.append(harness_bbox_from_person(pb))

        variants = [frame]
        variants.append(cv2.convertScaleAbs(frame, alpha=1.08, beta=8))
        variants.append(cv2.convertScaleAbs(frame, alpha=0.92, beta=-6))
        variants.append(cv2.flip(frame, 1))
        for variant in variants:
            _write_sample(variant, harness_boxes)
            count += 1

        for key in person_keys:
            if not harness.get(key):
                continue
            x1, y1, x2, y2 = boxes[key]
            pw, ph = x2 - x1, y2 - y1
            pad_x, pad_y = int(pw * 0.35), int(ph * 0.25)
            cx1 = max(0, x1 - pad_x)
            cy1 = max(0, y1 - pad_y)
            cx2 = min(frame.shape[1], x2 + pad_x)
            cy2 = min(frame.shape[0], y2 + pad_y)
            crop = frame[cy1:cy2, cx1:cx2]
            if crop.size == 0:
                continue
            hb = harness_bbox_from_person((float(x1 - cx1), float(y1 - cy1), float(x2 - cx1), float(y2 - cy1)))
            _write_sample(crop, [hb])
            _write_sample(cv2.flip(crop, 1), [(
                crop.shape[1] - hb[2], hb[1], crop.shape[1] - hb[0], hb[3],
            )])
            count += 2
    return count


def _seed_from_screenshot() -> int:
    count = 0
    for path in _EXTRA_IMAGES:
        if not path.is_file():
            continue
        frame = cv2.imread(str(path))
        if frame is None:
            continue
        h, w = frame.shape[:2]
        # Vùng người có dây X (ước lượng từ screenshot hiệu chuẩn)
        pb = (w * 0.38, h * 0.08, w * 0.62, h * 0.72)
        hb = harness_bbox_from_person(pb)
        _write_sample(frame, [hb])
        count += 1
        bright = cv2.convertScaleAbs(frame, alpha=1.1, beta=10)
        _write_sample(bright, [hb])
        count += 1
        flipped = cv2.flip(frame, 1)
        fhb = (w - hb[2], hb[1], w - hb[0], hb[3])
        _write_sample(flipped, [fhb])
        count += 1
        crop = frame[int(h * 0.05) : int(h * 0.78), int(w * 0.32) : int(w * 0.68)]
        if crop.size:
            ch, cw = crop.shape[:2]
            rel_pb = (cw * 0.18, ch * 0.04, cw * 0.82, ch * 0.88)
            _write_sample(crop, [harness_bbox_from_person(rel_pb)])
            count += 1
    return count


def main() -> None:
    task_dir("wah_harness")
    n1 = _seed_from_labels()
    n2 = _seed_from_screenshot()
    cfg = TASKS["wah_harness"]
    yaml_path = write_dataset_yaml("wah_harness", cfg)
    total = len(list((task_dir("wah_harness") / "images").glob("*.jpg")))
    print(f"Seeded {n1 + n2} writes — total images: {total}, yaml: {yaml_path}")


if __name__ == "__main__":
    main()
