#!/usr/bin/env python3
"""Đo nhịp suy luận AI thật và độ dịch bbox giữa hai khung liền nhau.

Người đi bộ mất track khi hộp ở khung sau không còn chồng lên hộp ở khung trước:
bộ ghép của tracker dựa vào IoU. Script đo đúng hai số đó trên luồng thật —
khoảng cách thời gian giữa hai lượt suy luận, và IoU của cùng một người giữa
hai lượt — để biết mất bám là do nhịp AI hay do tham số tracker.

  .venv/bin/python scripts/diag_ai_frame_interval.py rtsp://127.0.0.1:8554/hc-01 40
"""

from __future__ import annotations

import statistics
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import cv2  # noqa: E402


def _iou(a, b) -> float:
    ix1, iy1 = max(a[0], b[0]), max(a[1], b[1])
    ix2, iy2 = min(a[2], b[2]), min(a[3], b[3])
    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0
    inter = (ix2 - ix1) * (iy2 - iy1)
    area_a = max(1.0, (a[2] - a[0]) * (a[3] - a[1]))
    area_b = max(1.0, (b[2] - b[0]) * (b[3] - b[1]))
    return inter / (area_a + area_b - inter)


def main() -> int:
    source = sys.argv[1] if len(sys.argv) > 1 else "rtsp://127.0.0.1:8554/hc-01"
    want = int(sys.argv[2]) if len(sys.argv) > 2 else 30

    from app.patrol.person_analyzer import _get_person_detector

    detector = _get_person_detector()
    model = detector._model  # noqa: SLF001
    if model is None:
        print("FAIL: chưa load được YOLO")
        return 1

    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        print(f"FAIL: không mở được {source}")
        return 1

    infer_ms: list[float] = []
    gaps: list[float] = []
    best_ious: list[float] = []
    zero_iou = 0
    prev_boxes: list[tuple[float, ...]] = []
    prev_t = 0.0
    done = 0

    while done < want:
        ok, frame = cap.read()
        if not ok:
            break
        h, w = frame.shape[:2]
        if w > 960:
            frame = cv2.resize(frame, (960, int(h * 960 / w)), interpolation=cv2.INTER_AREA)

        t0 = time.perf_counter()
        res = model.predict(frame, conf=0.22, verbose=False, imgsz=1024, max_det=300, iou=0.50)
        dt = (time.perf_counter() - t0) * 1000.0
        infer_ms.append(dt)
        now = time.perf_counter()
        if prev_t:
            gaps.append(now - prev_t)
        prev_t = now
        done += 1

        boxes = []
        if res and res[0].boxes is not None:
            for b in res[0].boxes:
                if int(b.cls[0]) == 0:
                    boxes.append(tuple(float(v) for v in b.xyxy[0]))

        # Mỗi hộp ở khung này ghép với hộp gần nhất ở khung trước.
        for cur in boxes:
            if not prev_boxes:
                continue
            best = max(_iou(cur, p) for p in prev_boxes)
            best_ious.append(best)
            if best <= 0.0:
                zero_iou += 1
        prev_boxes = boxes

    cap.release()
    if not infer_ms:
        print("FAIL: không suy luận được khung nào")
        return 1

    print(f"Suy luận {len(infer_ms)} khung")
    print(f"  thời gian suy luận: median {statistics.median(infer_ms):.0f} ms"
          f"  max {max(infer_ms):.0f} ms")
    if gaps:
        print(f"  khoảng cách giữa 2 lượt: median {statistics.median(gaps):.2f} s"
              f"  → nhịp AI thực {1.0 / statistics.median(gaps):.2f} khung/giây")
    if best_ious:
        print(f"  IoU với khung trước: n={len(best_ious)}"
              f"  median {statistics.median(best_ious):.2f}")
        print(f"  hộp KHÔNG chồng gì khung trước (IoU=0): {zero_iou}/{len(best_ious)}"
              f"  = {100.0 * zero_iou / len(best_ious):.0f}%")
        low = sum(1 for v in best_ious if v < 0.30)
        print(f"  hộp IoU < 0.30 (dưới ngưỡng ghép thường dùng): {low}/{len(best_ious)}"
              f"  = {100.0 * low / len(best_ious):.0f}%")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
