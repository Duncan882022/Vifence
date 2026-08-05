#!/usr/bin/env python3
"""Gắn nhãn thủ công Cam04 demo — đọc bbox từ ảnh user bôi màu (orange/yellow/green)."""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.auto_train.dataset import _bbox_to_yolo_line, write_dataset_yaml
from app.auto_train.tasks import TASKS

ASSETS = Path("/Users/duncannguyen/.cursor/projects/Users-duncannguyen-Desktop-Vifence-CMS/assets")
DEMO_DIR = ROOT / "data" / "cam04_demo"
AT_DIR = ROOT / "data" / "auto_train" / "crane_machinery"
CLASS = {"tower_crane": 0, "crane_green": 1, "sany_drill": 2}

FRAMES = [
    {
        "key": "0355",
        "clean": ASSETS / "IMG_0355_2-f705540c-6252-42ab-a001-873d103519de.png",
        "ann": ASSETS / "IMG_0355_2-ad0bb1fb-0c30-4035-919c-55fdfd03c188.png",
        "boxes": None,
    },
    {
        "key": "0360",
        "clean": ASSETS / "IMG_0360-ac1ba99d-848d-4127-8e35-ecea98a865ec.png",
        "ann": ASSETS / "IMG_0360-43e274ad-2a62-4e75-9412-8d57ba696ef9.png",
        "boxes": None,
    },
    {
        "key": "0359",
        "clean": ASSETS / "IMG_0359-8be9a0e9-16e1-4805-8865-4874dbb78910.png",
        "ann": ASSETS / "IMG_0359-a32b2fdc-28ab-4e5b-bd88-e164c4ef5fd1.png",
        "boxes": None,
    },
]


def _boxes_from_annotation(ann_path: Path, clean_path: Path) -> dict[str, list[int]]:
    ann = cv2.imread(str(ann_path))
    clean = cv2.imread(str(clean_path))
    if ann is None or clean is None:
        raise FileNotFoundError(f"Missing image: {ann_path} / {clean_path}")
    h, w = ann.shape[:2]
    diff = cv2.absdiff(ann, clean)
    m = np.max(diff, axis=2) > 25
    hsv = cv2.cvtColor(ann, cv2.COLOR_BGR2HSV)
    H, S, V = cv2.split(hsv)

    def pick(lo: int, hi: int) -> tuple[int, int, int, int]:
        mask = ((H >= lo) & (H <= hi) & m & (S > 60) & (V > 100)).astype(np.uint8) * 255
        mask = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_RECT, (9, 9)), 2)
        cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        best = None
        best_area = 0
        for ctn in cnts:
            area = cv2.contourArea(ctn)
            if area < 1200:
                continue
            x, y, bw, bh = cv2.boundingRect(ctn)
            if area > best_area:
                best_area = area
                best = (x, y, x + bw, y + bh)
        if best is None:
            raise RuntimeError(f"No annotation box for hue {lo}-{hi} in {ann_path.name}")
        return best

    return {
        "sany_drill": list(pick(5, 18)),
        "tower_crane": list(pick(19, 34)),
        "crane_green": list(pick(35, 95)),
    }


def _write_yolo(stem: str, img: np.ndarray, boxes: dict[str, list[int]]) -> None:
    h, w = img.shape[:2]
    lines: list[str] = []
    for cls_name, box in boxes.items():
        line = _bbox_to_yolo_line(CLASS[cls_name], tuple(box), w, h)
        if line:
            lines.append(line)
    ok, buf = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), 92])
    if not ok:
        raise RuntimeError(f"encode failed: {stem}")
    (AT_DIR / "images" / f"{stem}.jpg").write_bytes(buf.tobytes())
    (AT_DIR / "labels" / f"{stem}.txt").write_text("\n".join(lines), encoding="utf-8")


def _augment(img: np.ndarray, labels_path: Path, stem: str) -> None:
    h, w = img.shape[:2]
    lines = labels_path.read_text(encoding="utf-8").strip().splitlines()
    flipped = cv2.flip(img, 1)
    flipped_lines: list[str] = []
    for line in lines:
        cls_id, cx, cy, bw, bh = line.split()
        cx_f = 1.0 - float(cx)
        flipped_lines.append(f"{cls_id} {cx_f:.6f} {cy} {bw} {bh}")
    ok, buf = cv2.imencode(".jpg", flipped, [int(cv2.IMWRITE_JPEG_QUALITY), 90])
    (AT_DIR / "images" / f"{stem}.jpg").write_bytes(buf.tobytes())
    (AT_DIR / "labels" / f"{stem}.txt").write_text("\n".join(flipped_lines), encoding="utf-8")


def main() -> None:
    DEMO_DIR.mkdir(parents=True, exist_ok=True)
    frames_out: list[dict] = []

    for spec in FRAMES:
        key = spec["key"]
        clean_path = Path(spec["clean"])
        img = cv2.imread(str(clean_path))
        if img is None:
            raise FileNotFoundError(clean_path)
        h, w = img.shape[:2]

        if spec["ann"] is not None:
            boxes = _boxes_from_annotation(Path(spec["ann"]), clean_path)
        else:
            boxes = spec["boxes"]
        assert boxes is not None

        demo_png = DEMO_DIR / f"{key}.png"
        shutil.copy2(clean_path, demo_png)
        stem = f"cam04_manual_{key}"
        _write_yolo(stem, img, boxes)
        _augment(img, AT_DIR / "labels" / f"{stem}.txt", f"{stem}_flip")

        frames_out.append({"file": f"{key}.png", "width": w, "height": h, "boxes": boxes})
        print(key, boxes)

    (DEMO_DIR / "labels.json").write_text(
        json.dumps({"frames": frames_out}, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    # Train/val chỉ dùng 6 ảnh nhãn tay (3 gốc + 3 flip)
    manual = sorted((AT_DIR / "images").glob("cam04_manual_*.jpg"))
    train_files = [p for p in manual if "_flip" not in p.stem]
    val_files = [p for p in manual if "_flip" in p.stem]
    (AT_DIR / "train_manual.txt").write_text(
        "\n".join(str(p.resolve()) for p in train_files),
        encoding="utf-8",
    )
    (AT_DIR / "val_manual.txt").write_text(
        "\n".join(str(p.resolve()) for p in val_files),
        encoding="utf-8",
    )

    names = TASKS["crane_machinery"].classes
    names_block = "\n".join(f"  {i}: {name}" for i, name in enumerate(names))
    (AT_DIR / "dataset_manual.yaml").write_text(
        f"train: {(AT_DIR / 'train_manual.txt').resolve()}\n"
        f"val: {(AT_DIR / 'val_manual.txt').resolve()}\n"
        f"names:\n{names_block}\n",
        encoding="utf-8",
    )
    write_dataset_yaml("crane_machinery", TASKS["crane_machinery"])
    print("manual dataset ready:", len(train_files), "train,", len(val_files), "val")


if __name__ == "__main__":
    main()
