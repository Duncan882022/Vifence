#!/usr/bin/env python3
"""So YOLOv8n với các biến thể lớn hơn trên đúng khung HC-01 đang chạy.

Đo hai thứ trên cùng một tập khung: số box `person` sinh ra (dương tính giả trên
xe máy đỗ là phần lớn) và thời gian suy luận mỗi khung. Dùng để trả lời câu
"đổi model có hết nhầm xe thành người mà VPS 6 vCPU còn gánh được không".

  .venv/bin/python scripts/bench_person_model.py rtsp://127.0.0.1:8554/hc-01 30
"""

from __future__ import annotations

import statistics
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import cv2  # noqa: E402

MODELS = ("yolov8n.pt", "yolov8s.pt", "yolov8m.pt")
CONF = 0.20
# Khung vào đã bị hạ xuống 960 px (`VMS_AI_MAX_WIDTH`), nên imgsz=1024 là phóng
# to ngược lên — tốn thời gian suy luận mà không thêm thông tin nào.
IMGSZ_SWEEP = (1024, 960, 768, 640)


def grab_frames(source: str, count: int):
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        return []
    frames = []
    read = 0
    while len(frames) < count and read < 1200:
        ok, frame = cap.read()
        read += 1
        if not ok or read % 5:
            continue
        h, w = frame.shape[:2]
        if w > 960:
            frame = cv2.resize(frame, (960, int(h * 960 / w)), interpolation=cv2.INTER_AREA)
        frames.append(frame)
    cap.release()
    return frames


def main() -> int:
    source = sys.argv[1] if len(sys.argv) > 1 else "rtsp://127.0.0.1:8554/hc-01"
    count = int(sys.argv[2]) if len(sys.argv) > 2 else 24

    frames = grab_frames(source, count)
    if not frames:
        print(f"FAIL: không lấy được khung từ {source}")
        return 1
    print(f"Đã lấy {len(frames)} khung {frames[0].shape[1]}x{frames[0].shape[0]}")

    from ultralytics import YOLO

    for name in MODELS:
        try:
            model = YOLO(name)
        except Exception as exc:  # noqa: BLE001
            print(f"{name}: KHÔNG TẢI ĐƯỢC — {exc}")
            continue
        # Một lượt làm nóng, không tính vào thời gian.
        model.predict(frames[0], conf=CONF, verbose=False, imgsz=1024, max_det=300, iou=0.50)

        times: list[float] = []
        confs: list[float] = []
        per_frame: list[int] = []
        for frame in frames:
            t0 = time.perf_counter()
            res = model.predict(
                frame, conf=CONF, verbose=False, imgsz=1024, max_det=300, iou=0.50,
            )
            times.append((time.perf_counter() - t0) * 1000.0)
            n = 0
            if res and res[0].boxes is not None:
                for b in res[0].boxes:
                    if int(b.cls[0]) == 0:
                        n += 1
                        confs.append(float(b.conf[0]))
            per_frame.append(n)
        band_lo = sum(1 for c in confs if c < 0.50)
        band_hi = sum(1 for c in confs if c >= 0.50)
        print(
            f"{name}: {statistics.median(times):.0f} ms/khung (median)"
            f"  person box tổng={len(confs)}"
            f"  trung bình {statistics.mean(per_frame):.2f}/khung"
            f"  conf<0.50: {band_lo}  conf>=0.50: {band_hi}"
        )
        if confs:
            print(
                f"    conf min={min(confs):.2f} median={statistics.median(confs):.2f}"
                f" max={max(confs):.2f}"
            )

    print("\n=== Quét imgsz (chi phí suy luận vs số box giữ được) ===")
    for name in ("yolov8n.pt", "yolov8s.pt"):
        try:
            model = YOLO(name)
        except Exception as exc:  # noqa: BLE001
            print(f"{name}: KHÔNG TẢI ĐƯỢC — {exc}")
            continue
        model.predict(frames[0], conf=CONF, verbose=False, imgsz=960, max_det=300, iou=0.50)
        for imgsz in IMGSZ_SWEEP:
            times: list[float] = []
            confs: list[float] = []
            for frame in frames:
                t0 = time.perf_counter()
                res = model.predict(
                    frame, conf=CONF, verbose=False, imgsz=imgsz, max_det=300, iou=0.50,
                )
                times.append((time.perf_counter() - t0) * 1000.0)
                if res and res[0].boxes is not None:
                    for b in res[0].boxes:
                        if int(b.cls[0]) == 0:
                            confs.append(float(b.conf[0]))
            hi = sum(1 for c in confs if c >= 0.50)
            med = statistics.median(times)
            print(
                f"{name} imgsz={imgsz:>4}: {med:>5.0f} ms/khung"
                f"  ({1000.0 / med:.2f} khung/giây)"
                f"  box={len(confs):>3}  conf>=0.50: {hi}"
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
