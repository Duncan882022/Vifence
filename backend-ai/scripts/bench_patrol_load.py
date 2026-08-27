#!/usr/bin/env python3
"""Đo chi phí CPU của một vòng phân tích tuần tra.

Trả lời một câu hỏi cụ thể: **máy chủ hiện tại có kham nổi 2 mũ + 1 drone
không**, và nếu không thì thiếu bao nhiêu.

Chạy trên chính máy chủ sẽ triển khai:
    backend-ai/.venv/bin/python backend-ai/scripts/bench_patrol_load.py
"""

from __future__ import annotations

import os
import statistics
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

import numpy as np  # noqa: E402

CAMERAS = 3
TARGET_FPS = 6.0
WARMUP = 3
ROUNDS = 12


def _frame(w: int = 1280, h: int = 720, seed: int = 3) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return (rng.random((h, w, 3)) * 255).astype(np.uint8)


def _bench(label: str, fn, rounds: int = ROUNDS) -> float:
    for _ in range(WARMUP):
        fn()
    samples = []
    for _ in range(rounds):
        t0 = time.perf_counter()
        fn()
        samples.append((time.perf_counter() - t0) * 1000.0)
    med = statistics.median(samples)
    print(f"  {label:<34} {med:7.1f} ms  (min {min(samples):.1f} / max {max(samples):.1f})")
    return med


def main() -> int:
    print(f"CPU khả dụng: {os.cpu_count()} nhân\n")
    frame = _frame()

    print("Chi phí mỗi khung hình:")

    from app.detectors.person_detector import PersonDetector

    detector = PersonDetector(conf_threshold=0.30)
    detector.load()
    if not detector.ready:
        print("  !! Không nạp được YOLOv8n — bỏ qua phần suy luận.")
        return 1

    yolo_ms = _bench("YOLOv8n @ imgsz=640", lambda: detector.predict(frame, conf=0.30))

    from app.patrol.egomotion import estimate_shift, reset

    reset()
    estimate_shift("BENCH", frame)
    ego_ms = _bench("Bù chuyển động camera", lambda: estimate_shift("BENCH", frame))

    from app.patrol_tracker import PROFILE_BODYCAM, PatrolTracker

    tracker = PatrolTracker(camera_id="BENCH", profile=PROFILE_BODYCAM)
    counter = {"t": 0.0}

    def _track() -> None:
        counter["t"] += 0.17
        tracker.update(
            [((100.0, 200.0, 220.0, 500.0), 0.7), ((600.0, 210.0, 720.0, 505.0), 0.6)],
            now=counter["t"],
        )

    track_ms = _bench("Tracker (2 người)", _track)

    per_frame = yolo_ms + ego_ms + track_ms
    budget_ms = 1000.0 / TARGET_FPS
    load = (per_frame * CAMERAS) / budget_ms

    print(f"\nMỗi khung: {per_frame:.1f} ms")
    print(f"Ngân sách ở {TARGET_FPS:.0f} FPS: {budget_ms:.0f} ms/khung/camera")
    print(f"{CAMERAS} camera cần: {load:.2f} nhân chỉ riêng phần phát hiện người\n")

    if load < 0.6:
        print("KẾT LUẬN: dư sức. Không cần nâng server.")
    elif load < 1.0:
        print("KẾT LUẬN: vừa đủ, nhưng không còn chỗ cho phần khác.")
        print("  → Tắt MACHINERY_DETECTOR_ENABLED nếu chưa tắt.")
    else:
        need = int(load) + 2
        print("KẾT LUẬN: KHÔNG ĐỦ. Ba camera sẽ tụt nhịp và ROI giật.")
        print(f"  → Cần khoảng {need} nhân, hoặc:")
        print("  → Hạ VMS_AI_FPS xuống 4, hoặc")
        print("  → Xuất YOLOv8n sang ONNX Runtime int8 (nhanh 2–4 lần trên CPU)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
