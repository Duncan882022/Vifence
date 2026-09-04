#!/usr/bin/env python3
"""Chẩn đoán ROI snapshot — tách từng tầng biến đổi bbox của Module 05.

Trên cùng một khung hình, vẽ và in ra bốn tầng:
  xanh dương  mặt YuNet (`_list_frame_faces`)
  đỏ          box YOLO thô (trước face-anchor)
  tím         box sau face-anchor (`anchor_patrol_person_boxes_to_faces`)
  vàng        overlay live (`patrol_person_overlay_bbox`)
  xanh lá     khung ghi lên JPG snapshot (`patrol_snapshot_draw_bbox`)

  .venv/bin/python scripts/diag_snapshot_roi.py rtsp://127.0.0.1:8554/hc-01 HC-01 6
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

os.environ.setdefault("PATROL_DRONE_ALTITUDE_OVERRIDES", "DR-03:3")

import cv2  # noqa: E402

OUT_DIR = Path("/tmp/roi-diag")


def _rect(canvas, box, color, thickness=2) -> None:
    x1, y1, x2, y2 = (int(v) for v in box)
    cv2.rectangle(canvas, (x1, y1), (x2, y2), color, thickness)


def main() -> int:
    source = sys.argv[1] if len(sys.argv) > 1 else "rtsp://127.0.0.1:8554/hc-01"
    camera_id = sys.argv[2] if len(sys.argv) > 2 else "HC-01"
    want = int(sys.argv[3]) if len(sys.argv) > 3 else 6

    from app.patrol_face_anchor import (
        _list_frame_faces,
        _person_box_from_face,
        anchor_patrol_person_boxes_to_faces,
    )
    from app.patrol_person_visibility import (
        patrol_person_overlay_bbox,
        patrol_snapshot_draw_bbox,
    )
    from app.patrol.person_analyzer import (
        _PERSON_CONF_BODYCAM,
        _dedupe_person_boxes,
        _filter_persons,
        _get_person_detector,
        _match_raw_yolo_person_box,
    )

    detector = _get_person_detector()

    def raw_person_boxes(frame, camera_id):
        raw_persons = _dedupe_person_boxes(
            _filter_persons(
                frame,
                camera_id,
                detector.predict(frame, conf=_PERSON_CONF_BODYCAM),
                strict=False,
                min_conf=_PERSON_CONF_BODYCAM,
                for_display=True,
            ),
            camera_id=camera_id,
        )
        return [(p.person_box, p.person_conf) for p in raw_persons]

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    cap = cv2.VideoCapture(source)
    if not cap.isOpened():
        print(f"FAIL: không mở được {source}")
        return 1

    saved = 0
    read = 0
    while saved < want and read < 1200:
        ok, frame = cap.read()
        read += 1
        if not ok:
            continue
        if read % 7:
            continue
        max_w = 960
        h, w = frame.shape[:2]
        if w > max_w:
            scale = max_w / w
            frame = cv2.resize(frame, (max_w, int(h * scale)), interpolation=cv2.INTER_AREA)
        fh, fw = frame.shape[:2]

        raw_yolo = raw_person_boxes(frame, camera_id)
        faces = _list_frame_faces(frame)
        anchored = anchor_patrol_person_boxes_to_faces(
            frame, list(raw_yolo), camera_id=camera_id,
        )
        if not anchored and not faces and not raw_yolo:
            continue

        canvas = frame.copy()
        print(f"--- frame#{read} {fw}x{fh}")
        for face in faces:
            fx1, fy1, fx2, fy2 = face.box
            synth = _person_box_from_face(face, fw, fh)
            print(
                f"    FACE  box={tuple(round(v) for v in face.box)}"
                f" {round(fx2 - fx1)}x{round(fy2 - fy1)} score={face.score:.2f}"
                f" -> synth={tuple(round(v) for v in synth)}"
                f" {round(synth[2] - synth[0])}x{round(synth[3] - synth[1])}"
            )
            _rect(canvas, face.box, (255, 128, 0), 2)
        for box, conf in raw_yolo:
            print(
                f"    YOLO  box={tuple(round(v) for v in box)}"
                f" {round(box[2] - box[0])}x{round(box[3] - box[1])} conf={conf:.2f}"
            )
            _rect(canvas, box, (0, 0, 255), 2)
        for box, conf in anchored:
            matched = _match_raw_yolo_person_box(box, [b for b, _ in raw_yolo])
            roi_src = matched or box
            overlay = patrol_person_overlay_bbox(roi_src, fw, fh)
            shot = patrol_snapshot_draw_bbox(overlay, fw, fh)
            print(
                f"    ANCH  box={tuple(round(v) for v in box)}"
                f" {round(box[2] - box[0])}x{round(box[3] - box[1])} conf={conf:.2f}"
                f" yolo_match={'yes' if matched else 'NO(synth)'}"
                f" -> overlay={tuple(round(v) for v in overlay)}"
                f" {round(overlay[2] - overlay[0])}x{round(overlay[3] - overlay[1])}"
                f" -> snapshot={tuple(round(v) for v in shot)}"
            )
            _rect(canvas, box, (255, 0, 200), 2)
            _rect(canvas, overlay, (0, 200, 255), 2)
            _rect(canvas, shot, (0, 255, 0), 1)
        cv2.putText(
            canvas, "blue=face  red=yolo  magenta=anchor  yellow=overlay  green=snapshot",
            (10, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.52, (255, 255, 255), 2,
        )
        out = OUT_DIR / f"diag-{camera_id}-{read:04d}.jpg"
        cv2.imwrite(str(out), canvas, [int(cv2.IMWRITE_JPEG_QUALITY), 88])
        saved += 1
    cap.release()
    print(f"OK: {saved} ảnh trong {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
