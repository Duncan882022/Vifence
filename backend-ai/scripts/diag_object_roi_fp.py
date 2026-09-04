#!/usr/bin/env python3
"""Hộp nào lọt cổng ghi thẻ Đối tượng — và trong hộp đó có người thật không.

Thẻ Đối tượng đang nhiều gấp bốn thẻ Người, và ảnh chụp cho thấy ROI khoanh vào
nền xa. Script lấy khung thật, chạy đúng cổng `patrol_object_commit_allowed`,
rồi cắt từng hộp được nhận ra thành một tấm montage để mắt người phán xét, kèm
số đo kích thước / vị trí / tỉ lệ.

  .venv/bin/python scripts/diag_object_roi_fp.py rtsp://127.0.0.1:8554/hc-01 24
"""

from __future__ import annotations

import statistics
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import cv2  # noqa: E402
import numpy as np  # noqa: E402

OUT = Path("/tmp/obj_fp_crops.jpg")


def main() -> int:
    source = sys.argv[1] if len(sys.argv) > 1 else "rtsp://127.0.0.1:8554/hc-01"
    want = int(sys.argv[2]) if len(sys.argv) > 2 else 24

    from app.patrol.person_analyzer import _get_person_detector
    from app.patrol_person_visibility import (
        patrol_bbox_rejects_static_fp,
        patrol_object_commit_allowed,
    )

    detector = _get_person_detector()
    model = detector._model  # noqa: SLF001
    if model is None:
        print("FAIL: chưa load được YOLO")
        return 1

    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        print(f"FAIL: không mở được {source}")
        return 1

    crops: list[np.ndarray] = []
    heights: list[float] = []
    rows: list[tuple] = []
    n_raw = 0
    n_pass = 0
    n_static_fp = 0
    grabbed = 0

    while grabbed < want:
        ok, frame = cap.read()
        if not ok:
            break
        h0, w0 = frame.shape[:2]
        if w0 > 960:
            frame = cv2.resize(frame, (960, int(h0 * 960 / w0)), interpolation=cv2.INTER_AREA)
        fh, fw = frame.shape[:2]
        grabbed += 1

        res = model.predict(frame, conf=0.22, verbose=False, imgsz=1024, max_det=300, iou=0.50)
        if not res or res[0].boxes is None:
            continue
        for b in res[0].boxes:
            if int(b.cls[0]) != 0:
                continue
            n_raw += 1
            box = tuple(float(v) for v in b.xyxy[0])
            conf = float(b.conf[0])
            if patrol_bbox_rejects_static_fp(box, fw, fh):
                n_static_fp += 1
            if not patrol_object_commit_allowed(box, fw, fh, face_eligible=False):
                continue
            n_pass += 1
            x1, y1, x2, y2 = (int(max(0, v)) for v in box)
            x2, y2 = min(fw, x2), min(fh, y2)
            bw, bh = x2 - x1, y2 - y1
            if bw < 4 or bh < 4:
                continue
            heights.append(float(bh))
            rows.append((round(conf, 2), bw, bh, round(bh / max(bw, 1), 2),
                         f"y={y1}-{y2}"))
            crop = frame[y1:y2, x1:x2]
            # Phóng về khung cao 180 px, giữ tỉ lệ — hộp nhỏ mới nhìn ra được gì.
            scale = 180.0 / max(bh, 1)
            crop = cv2.resize(crop, (max(1, int(bw * scale)), 180))
            crop = crop[:, :140] if crop.shape[1] > 140 else cv2.copyMakeBorder(
                crop, 0, 0, 0, 140 - crop.shape[1], cv2.BORDER_CONSTANT, value=(0, 0, 0),
            )
            cv2.putText(crop, f"{conf:.2f} {bw}x{bh}", (2, 14),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.38, (0, 255, 255), 1)
            crops.append(crop)

    cap.release()

    print(f"Khung đã lấy: {grabbed}")
    print(f"Hộp person thô: {n_raw}   bị coi là vật tĩnh: {n_static_fp}"
          f"   LỌT cổng ghi thẻ: {n_pass}")
    if heights:
        hs = sorted(heights)
        print("Chiều cao hộp lọt cổng (px, khung cao ~540):")
        for q in (0, 25, 50, 75, 100):
            print(f"  p{q:<3} = {hs[min(len(hs) - 1, q * len(hs) // 100)]:.0f}")
        print(f"  trung vị {statistics.median(hs):.0f}")
        for thr in (40, 60, 80, 100):
            n = sum(1 for v in heights if v < thr)
            print(f"  cao < {thr:3d} px: {n:3d}/{len(heights)} = {100 * n / len(heights):2.0f}%")
    print("\n20 hộp nhỏ nhất (conf, rộng, cao, tỉ lệ cao/rộng, dải y):")
    for r in sorted(rows, key=lambda x: x[2])[:20]:
        print("  ", r)

    if crops:
        per_row = 10
        grid = []
        for i in range(0, len(crops), per_row):
            r = crops[i:i + per_row]
            while len(r) < per_row:
                r.append(np.zeros((180, 140, 3), np.uint8))
            grid.append(np.hstack(r))
        cv2.imwrite(str(OUT), np.vstack(grid), [cv2.IMWRITE_JPEG_QUALITY, 85])
        print(f"\nĐã ghi {len(crops)} hộp cắt ra: {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
