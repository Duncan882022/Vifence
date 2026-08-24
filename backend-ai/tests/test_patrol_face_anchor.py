"""Unit tests — anchor YOLO person box to YuNet face (HC bodycam)."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.patrol_face_anchor import (  # noqa: E402
    _FrameFace,
    anchor_patrol_person_boxes_to_faces,
)


class TestPatrolFaceAnchor(unittest.TestCase):
    def test_rejects_person_box_without_face(self):
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        fabric = (900.0, 80.0, 1100.0, 620.0)
        face = _FrameFace(box=(320.0, 180.0, 520.0, 420.0), score=0.88)
        with patch("app.patrol_face_anchor._list_frame_faces", return_value=[face]):
            out = anchor_patrol_person_boxes_to_faces(
                frame,
                [(fabric, 0.55)],
                camera_id="HC-02",
            )
        self.assertEqual(len(out), 1)
        box, conf = out[0]
        cx = (box[0] + box[2]) / 2
        self.assertLess(cx, 700.0)
        self.assertGreater(conf, 0.7)

    def test_keeps_person_box_containing_face(self):
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        person = (280.0, 120.0, 620.0, 680.0)
        face = _FrameFace(box=(380.0, 180.0, 520.0, 360.0), score=0.9)
        with patch("app.patrol_face_anchor._list_frame_faces", return_value=[face]):
            out = anchor_patrol_person_boxes_to_faces(
                frame,
                [(person, 0.72)],
                camera_id="HC-02",
            )
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0][0], person)

    def test_multiple_faces_yield_multiple_boxes(self):
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        face_a = _FrameFace(box=(120.0, 180.0, 220.0, 320.0), score=0.88)
        face_b = _FrameFace(box=(820.0, 200.0, 920.0, 340.0), score=0.85)
        with patch("app.patrol_face_anchor._list_frame_faces", return_value=[face_a, face_b]):
            out = anchor_patrol_person_boxes_to_faces(frame, [], camera_id="HC-02")
        self.assertEqual(len(out), 2)
        centers = sorted((box[0] + box[2]) / 2 for box, _ in out)
        self.assertLess(centers[0], 400.0)
        self.assertGreater(centers[1], 700.0)

    def test_yolo_plus_unmatched_face_keeps_both(self):
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        person = (280.0, 120.0, 620.0, 680.0)
        face_in = _FrameFace(box=(380.0, 180.0, 520.0, 360.0), score=0.9)
        face_far = _FrameFace(box=(900.0, 200.0, 1000.0, 340.0), score=0.82)
        with patch("app.patrol_face_anchor._list_frame_faces", return_value=[face_in, face_far]):
            out = anchor_patrol_person_boxes_to_faces(
                frame,
                [(person, 0.72)],
                camera_id="HC-02",
            )
        self.assertEqual(len(out), 2)
        self.assertIn(person, [box for box, _ in out])


    def test_yolo_back_turn_kept_when_upper_body_visible(self):
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        face_other = _FrameFace(box=(1120.0, 200.0, 1200.0, 340.0), score=0.85)
        back_turn = (180.0, 140.0, 420.0, 620.0)
        with patch("app.patrol_face_anchor._list_frame_faces", return_value=[face_other]):
            out = anchor_patrol_person_boxes_to_faces(
                frame,
                [(back_turn, 0.68)],
                camera_id="HC-02",
            )
        boxes = [box for box, _ in out]
        self.assertIn(back_turn, boxes)
        self.assertGreaterEqual(len(out), 2)

    def test_fabric_yolo_rejected_without_face(self):
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        face = _FrameFace(box=(320.0, 180.0, 520.0, 420.0), score=0.88)
        fabric = (900.0, 80.0, 1100.0, 620.0)
        with patch("app.patrol_face_anchor._list_frame_faces", return_value=[face]):
            out = anchor_patrol_person_boxes_to_faces(
                frame,
                [(fabric, 0.55)],
                camera_id="HC-02",
            )
        self.assertNotIn(fabric, [box for box, _ in out])


if __name__ == "__main__":
    unittest.main()
