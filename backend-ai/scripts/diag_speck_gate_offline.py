#!/usr/bin/env python3
"""Cổng vệt vuông giữ lại gì và bỏ gì, chạy trên ảnh đã lưu.

Dùng khi luồng RTSP không còn: các JPG trong `patrol_snapshots` là full-frame,
chạy lại YOLO trên chúng rồi so số hộp lọt cổng ghi thẻ trước và sau khi có
`speck_person_box`. Ảnh có badge ROI vẽ sẵn nhưng badge nhỏ và không nằm trên
người, không ảnh hưởng tới việc đếm hộp.

  .venv/bin/python scripts/diag_speck_gate_offline.py 60
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import cv2  # noqa: E402


def main() -> int:
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 60

    from app.patrol import sink
    from app.patrol.person_analyzer import _get_person_detector
    from app.patrol_person_visibility import (
        patrol_object_commit_allowed,
        patrol_person_meets_display_gate,
        speck_person_box,
    )

    files = sorted(sink.SNAPSHOT_DIR.rglob("*.jpg"))[:limit]
    if not files:
        print(f"FAIL: không có ảnh nào trong {sink.SNAPSHOT_DIR}")
        return 1

    detector = _get_person_detector()
    model = detector._model  # noqa: SLF001
    if model is None:
        print("FAIL: chưa load được YOLO")
        return 1

    raw = 0
    speck = 0
    commit_before = 0
    commit_after = 0
    display_after = 0
    kept: list[tuple] = []

    for path in files:
        frame = cv2.imread(str(path))
        if frame is None:
            continue
        fh, fw = frame.shape[:2]
        res = model.predict(frame, conf=0.22, verbose=False, imgsz=1024, max_det=300, iou=0.50)
        if not res or res[0].boxes is None:
            continue
        for b in res[0].boxes:
            if int(b.cls[0]) != 0:
                continue
            raw += 1
            box = tuple(float(v) for v in b.xyxy[0])
            is_speck = speck_person_box(box, fw, fh)
            if is_speck:
                speck += 1
            # "Trước" = cổng ghi thẻ khi bỏ qua luật vệt vuông.
            after = patrol_object_commit_allowed(box, fw, fh)
            before = after or is_speck
            if before:
                commit_before += 1
            if after:
                commit_after += 1
                bh = box[3] - box[1]
                bw = box[2] - box[0]
                kept.append((round(float(b.conf[0]), 2), round(bw), round(bh),
                             round(bh / max(bw, 1), 2)))
            if patrol_person_meets_display_gate(box, fw, fh):
                display_after += 1

    print(f"Ảnh đã quét: {len(files)}")
    print(f"Hộp person thô: {raw}")
    print(f"  bị coi là vệt vuông: {speck}  = {100 * speck / max(raw, 1):.0f}%")
    print(f"Lọt cổng ghi thẻ TRƯỚC: {commit_before}")
    print(f"Lọt cổng ghi thẻ  SAU : {commit_after}"
          f"   (giảm {commit_before - commit_after},"
          f" còn {100 * commit_after / max(commit_before, 1):.0f}%)")
    print(f"Lọt cổng vẽ ROI   SAU : {display_after}")
    if kept:
        hs = sorted(k[2] for k in kept)
        print(f"\nHộp còn được giữ — cao nhỏ nhất {hs[0]}, trung vị"
              f" {hs[len(hs) // 2]}, lớn nhất {hs[-1]}")
        print("10 hộp nhỏ nhất còn giữ (conf, rộng, cao, tỉ lệ):")
        for k in sorted(kept, key=lambda x: x[2])[:10]:
            print("  ", k)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
