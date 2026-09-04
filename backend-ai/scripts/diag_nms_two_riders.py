#!/usr/bin/env python3
"""NMS có đang gộp hai người đèo nhau thành một hộp không.

Người ngồi sau che gần hết người ngồi trước, nên hai hộp chồng nhau rất nhiều.
NMS ở ngưỡng IoU 0.50 sẽ bỏ hộp điểm thấp hơn — một người mất hộp, mất track,
mất thẻ. Script chạy lại YOLO trên ảnh đã lưu ở nhiều ngưỡng NMS và đếm hộp
person, rồi chỉ ra đúng những ảnh mà nới ngưỡng lại tìm thêm được người.

  .venv/bin/python scripts/diag_nms_two_riders.py 80
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import cv2  # noqa: E402

THRESHOLDS = (0.50, 0.65, 0.75, 0.85)


def main() -> int:
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 80

    from app.patrol import sink
    from app.patrol.person_analyzer import _get_person_detector
    from app.patrol_person_visibility import patrol_person_meets_display_gate

    files = sorted(sink.SNAPSHOT_DIR.rglob("*.jpg"))[:limit]
    if not files:
        print(f"FAIL: không có ảnh nào trong {sink.SNAPSHOT_DIR}")
        return 1

    detector = _get_person_detector()
    model = detector._model  # noqa: SLF001
    if model is None:
        print("FAIL: chưa load được YOLO")
        return 1

    totals = dict.fromkeys(THRESHOLDS, 0)
    gained: list[tuple[str, int, int]] = []

    for path in files:
        frame = cv2.imread(str(path))
        if frame is None:
            continue
        fh, fw = frame.shape[:2]
        counts: dict[float, int] = {}
        for thr in THRESHOLDS:
            res = model.predict(
                frame, conf=0.22, verbose=False, imgsz=1024, max_det=300, iou=thr,
            )
            n = 0
            if res and res[0].boxes is not None:
                for b in res[0].boxes:
                    if int(b.cls[0]) != 0:
                        continue
                    box = tuple(float(v) for v in b.xyxy[0])
                    # Chỉ đếm hộp thật sự được vẽ — nới NMS mà chỉ thêm rác thì vô nghĩa.
                    if patrol_person_meets_display_gate(box, fw, fh):
                        n += 1
            counts[thr] = n
            totals[thr] += n
        base = counts[THRESHOLDS[0]]
        best = max(counts.values())
        if best > base:
            gained.append((path.name, base, best))

    print(f"Ảnh đã quét: {len(files)}")
    print("Tổng hộp person được vẽ theo ngưỡng NMS:")
    for thr in THRESHOLDS:
        delta = totals[thr] - totals[THRESHOLDS[0]]
        print(f"  iou={thr:.2f}: {totals[thr]:4d}"
              f"   ({delta:+d} so với {THRESHOLDS[0]:.2f})")
    print(f"\nẢnh mà nới NMS tìm thêm được người: {len(gained)}/{len(files)}")
    for name, base, best in sorted(gained, key=lambda x: x[1] - x[2])[:15]:
        print(f"   {name}: {base} -> {best}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
