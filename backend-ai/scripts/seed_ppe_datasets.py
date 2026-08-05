#!/usr/bin/env python3
"""Seed 3 dataset PPE (mũ / áo phản quang / giày) từ ảnh & clip có sẵn."""

from __future__ import annotations

import shutil
import sys
from pathlib import Path

import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.auto_train.dataset import write_sample  # noqa: E402
from app.auto_train.tasks import TASKS  # noqa: E402
from app.ppe_analyzer import (  # noqa: E402
    _feet_metrics,
    _looks_barefoot_or_open_footwear,
    _sub_region,
)

REPO = ROOT.parent
FEEDS = REPO / "public" / "camera-feeds"

SOURCES: list[tuple[Path, str | None, int]] = [
    (FEEDS / "cam04-ppe-workers.jpg", None, 1),
    (FEEDS / "violation-no-helmet.mp4", "no_helmet", 40),
    (FEEDS / "violation-no-vest.mp4", "no_vest", 40),
    (FEEDS / "ocp1-a-04.mp4", None, 25),
    (FEEDS / "ttdv-a-cam04-test.mp4", None, 30),
]


def _person_boxes(frame: np.ndarray) -> list[tuple[float, float, float, float]]:
    from ultralytics import YOLO

    model = YOLO("yolov8n.pt")
    results = model.predict(frame, conf=0.38, verbose=False)
    if not results or results[0].boxes is None:
        return []
    out: list[tuple[float, float, float, float]] = []
    for box in results[0].boxes:
        if int(box.cls[0]) != 0:
            continue
        x1, y1, x2, y2 = [float(v) for v in box.xyxy[0]]
        if (x2 - x1) * (y2 - y1) < 900:
            continue
        out.append((x1, y1, x2, y2))
    return out


def _region(frame: np.ndarray, box: tuple[float, float, float, float], y0: float, y1: float) -> np.ndarray:
    h, w = frame.shape[:2]
    x1, y1b, x2, y2b = box
    ph = y2b - y1b
    ry1 = int(y1b + ph * y0)
    ry2 = int(y1b + ph * y1)
    rx1 = int(max(0, x1))
    rx2 = int(min(w, x2))
    ry1 = max(0, min(h - 1, ry1))
    ry2 = max(ry1 + 1, min(h, ry2))
    return frame[ry1:ry2, rx1:rx2]


def _helmet_box(frame: np.ndarray, person: tuple[float, float, float, float]) -> tuple[float, float, float, float] | None:
    crop = _region(frame, person, 0.0, 0.28)
    if crop.size == 0:
        return None
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    white = cv2.inRange(hsv, np.array([0, 0, 170]), np.array([180, 55, 255]))
    yellow = cv2.inRange(hsv, np.array([18, 80, 120]), np.array([38, 255, 255]))
    mask = cv2.bitwise_or(white, yellow)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8), 1)
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        return None
    cnt = max(cnts, key=cv2.contourArea)
    if cv2.contourArea(cnt) < 80:
        return None
    x, y, bw, bh = cv2.boundingRect(cnt)
    px1, py1, _, _ = person
    ph = person[3] - person[1]
    gx1 = px1 + x
    gy1 = py1 + y
    return gx1, gy1, gx1 + bw, gy1 + bh


def _vest_box(frame: np.ndarray, person: tuple[float, float, float, float]) -> tuple[float, float, float, float] | None:
    crop = _region(frame, person, 0.22, 0.68)
    if crop.size == 0:
        return None
    hsv = cv2.cvtColor(crop, cv2.COLOR_BGR2HSV)
    hi_vis = cv2.inRange(hsv, np.array([25, 90, 90]), np.array([45, 255, 255]))
    green = cv2.inRange(hsv, np.array([38, 70, 70]), np.array([85, 255, 255]))
    orange = cv2.inRange(hsv, np.array([8, 120, 120]), np.array([22, 255, 255]))
    mask = cv2.bitwise_or(hi_vis, cv2.bitwise_or(green, orange))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8), 2)
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        return None
    cnt = max(cnts, key=cv2.contourArea)
    if cv2.contourArea(cnt) < 200:
        return None
    x, y, bw, bh = cv2.boundingRect(cnt)
    px1, py1, _, _ = person
    ph = person[3] - person[1]
    off_y = person[1] + ph * 0.22
    return px1 + x, off_y + y, px1 + x + bw, off_y + y + bh


def _shoes_box(frame: np.ndarray, person: tuple[float, float, float, float]) -> tuple[float, float, float, float] | None:
    crop = _region(frame, person, 0.82, 1.0)
    if crop.size == 0:
        return None
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
    _, dark = cv2.threshold(gray, 95, 255, cv2.THRESH_BINARY_INV)
    dark = cv2.morphologyEx(dark, cv2.MORPH_CLOSE, np.ones((5, 3), np.uint8), 1)
    cnts, _ = cv2.findContours(dark, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        return None
    cnt = max(cnts, key=cv2.contourArea)
    if cv2.contourArea(cnt) < 120:
        return None
    x, y, bw, bh = cv2.boundingRect(cnt)
    px1, _, _, py2 = person
    ph = person[3] - person[1]
    off_y = person[1] + ph * 0.82
    return px1 + x, off_y + y, px1 + x + bw, off_y + y + bh


def _label_frame(frame: np.ndarray, skip: str | None) -> tuple[list, list, list]:
    helmets: list[tuple[str, float, float, float, float]] = []
    vests: list[tuple[str, float, float, float, float]] = []
    shoes: list[tuple[str, float, float, float, float]] = []
    for person in _person_boxes(frame):
        if skip != "no_helmet":
            hb = _helmet_box(frame, person)
            if hb:
                helmets.append(("hard_hat", *hb))
        if skip != "no_vest":
            vb = _vest_box(frame, person)
            if vb:
                vests.append(("safety_vest", *vb))
        if skip != "no_shoes":
            feet = _sub_region(person, 0.78, 1.0)
            metrics = _feet_metrics(frame, feet)
            if not _looks_barefoot_or_open_footwear(metrics):
                sb = _shoes_box(frame, person)
                if sb:
                    shoes.append(("safety_shoes", *sb))
    return helmets, vests, shoes


def _save_augmented(task_id: str, frame: np.ndarray, boxes: list[tuple[str, float, float, float, float]]) -> int:
    cfg = TASKS[task_id]
    n = 0
    if write_sample(task_id, cfg, frame, boxes):
        n += 1
    flipped = cv2.flip(frame, 1)
    w = frame.shape[1]
    flipped_boxes: list[tuple[str, float, float, float, float]] = []
    for cls, x1, y1, x2, y2 in boxes:
        flipped_boxes.append((cls, w - x2, y1, w - x1, y2))
    if flipped_boxes and write_sample(task_id, cfg, flipped, flipped_boxes):
        n += 1
    return n


def _iter_frames(path: Path, max_frames: int):
    if path.suffix.lower() in {".jpg", ".jpeg", ".png"}:
        img = cv2.imread(str(path))
        if img is not None:
            yield img
        return
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        return
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or max_frames
    step = max(1, total // max_frames)
    idx = 0
    taken = 0
    while taken < max_frames:
        cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
        ok, frame = cap.read()
        if not ok:
            break
        yield frame
        taken += 1
        idx += step
    cap.release()


def main() -> None:
    for task_id in ("ppe_helmet", "ppe_vest", "ppe_shoes"):
        d = ROOT / "data" / "auto_train" / task_id
        if d.exists():
            shutil.rmtree(d)
        (d / "images").mkdir(parents=True)
        (d / "labels").mkdir(parents=True)

    counts = {"ppe_helmet": 0, "ppe_vest": 0, "ppe_shoes": 0}
    for src, skip, limit in SOURCES:
        if not src.exists():
            print(f"skip missing {src}")
            continue
        for frame in _iter_frames(src, limit):
            helmets, vests, shoes = _label_frame(frame, skip)
            counts["ppe_helmet"] += _save_augmented("ppe_helmet", frame, helmets)
            counts["ppe_vest"] += _save_augmented("ppe_vest", frame, vests)
            counts["ppe_shoes"] += _save_augmented("ppe_shoes", frame, shoes)

    print("Seeded samples:", counts)


if __name__ == "__main__":
    main()
