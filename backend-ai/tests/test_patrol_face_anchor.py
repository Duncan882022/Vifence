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
    BACK_TURN_MIN_CONF,
    _FrameFace,
    anchor_patrol_person_boxes_to_faces,
)


class TestPatrolFaceAnchor(unittest.TestCase):
    def test_rejects_implausible_silhouette_without_face(self):
        """Dải hẹp cao (rèm/cột) không phải dáng người — loại dù không có mặt."""
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        strip = (900.0, 40.0, 960.0, 700.0)
        face = _FrameFace(box=(320.0, 180.0, 520.0, 420.0), score=0.88)
        with patch("app.patrol_face_anchor._list_frame_faces", return_value=[face]):
            out = anchor_patrol_person_boxes_to_faces(
                frame,
                [(strip, 0.55)],
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

    def test_large_yolo_single_face_uses_tight_synth_not_crowd_box(self):
        """YOLO gom cả đám nhưng chỉ 1 mặt — neo synth, không giữ bbox rộng."""
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        crowd_box = (80.0, 80.0, 1180.0, 680.0)
        face_a = _FrameFace(box=(380.0, 180.0, 520.0, 360.0), score=0.9)
        with patch("app.patrol_face_anchor._list_frame_faces", return_value=[face_a]):
            out = anchor_patrol_person_boxes_to_faces(
                frame,
                [(crowd_box, 0.74)],
                camera_id="HC-02",
            )
        self.assertEqual(len(out), 1)
        box, _conf = out[0]
        self.assertNotEqual(box, crowd_box)
        cx = (box[0] + box[2]) / 2
        self.assertLess(abs(cx - 450.0), 120.0)

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

    def test_oversized_yolo_with_two_faces_yields_two_boxes(self):
        """YOLO gom cả đám — mỗi mặt phải có bbox riêng."""
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        crowd_box = (80.0, 80.0, 1180.0, 680.0)
        face_a = _FrameFace(box=(180.0, 180.0, 280.0, 320.0), score=0.9)
        face_b = _FrameFace(box=(820.0, 200.0, 920.0, 340.0), score=0.86)
        with patch("app.patrol_face_anchor._list_frame_faces", return_value=[face_a, face_b]):
            out = anchor_patrol_person_boxes_to_faces(
                frame,
                [(crowd_box, 0.74)],
                camera_id="HC-02",
            )
        self.assertEqual(len(out), 2)
        centers = sorted((box[0] + box[2]) / 2 for box, _ in out)
        self.assertLess(centers[0], 400.0)
        self.assertGreater(centers[1], 700.0)

    def test_large_yolo_does_not_suppress_distant_face_synth(self):
        """Mặt ngoài bbox YOLO vẫn được synth dù IoU với box YOLO lớn."""
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        near_box = (260.0, 100.0, 680.0, 700.0)
        face_near = _FrameFace(box=(380.0, 180.0, 520.0, 360.0), score=0.9)
        face_far = _FrameFace(box=(980.0, 210.0, 1080.0, 350.0), score=0.84)
        with patch("app.patrol_face_anchor._list_frame_faces", return_value=[face_near, face_far]):
            out = anchor_patrol_person_boxes_to_faces(
                frame,
                [(near_box, 0.71)],
                camera_id="HC-02",
            )
        self.assertEqual(len(out), 2)
        centers = sorted((box[0] + box[2]) / 2 for box, _ in out)
        self.assertLess(centers[0], 600.0)
        self.assertGreater(centers[1], 900.0)

    def test_fallback_emits_all_faces_when_yolo_rejected(self):
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        face_a = _FrameFace(box=(120.0, 180.0, 220.0, 320.0), score=0.88)
        face_b = _FrameFace(box=(820.0, 200.0, 920.0, 340.0), score=0.85)
        junk = (900.0, 40.0, 960.0, 700.0)
        with patch("app.patrol_face_anchor._list_frame_faces", return_value=[face_a, face_b]):
            out = anchor_patrol_person_boxes_to_faces(
                frame,
                [(junk, 0.55)],
                camera_id="HC-02",
            )
        self.assertEqual(len(out), 2)


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

    def test_back_turn_close_to_camera_kept(self):
        """Bodycam hay bắt người rất gần — bbox cao gần hết khung vẫn phải giữ."""
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        close_back_turn = (420.0, 60.0, 760.0, 660.0)
        face_other = _FrameFace(box=(1120.0, 200.0, 1200.0, 340.0), score=0.85)
        with patch("app.patrol_face_anchor._list_frame_faces", return_value=[face_other]):
            out = anchor_patrol_person_boxes_to_faces(
                frame,
                [(close_back_turn, 0.44)],
                camera_id="HC-02",
            )
        self.assertIn(close_back_turn, [box for box, _ in out])

    def test_back_turn_kept_at_yolo_confidence_floor(self):
        """Ngưỡng quay lưng không được cao hơn sàn YOLO bodycam."""
        self.assertLessEqual(BACK_TURN_MIN_CONF, 0.30)
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        back_turn = (180.0, 140.0, 420.0, 620.0)
        with patch("app.patrol_face_anchor._list_frame_faces", return_value=[]):
            out = anchor_patrol_person_boxes_to_faces(
                frame,
                [(back_turn, BACK_TURN_MIN_CONF)],
                camera_id="HC-02",
            )
        self.assertIn(back_turn, [box for box, _ in out])

    def test_back_turn_without_head_rejected(self):
        """Chỉ thấy chân thì không phải Đối tượng."""
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        legs = (560.0, 520.0, 660.0, 706.0)
        with patch("app.patrol_face_anchor._list_frame_faces", return_value=[]):
            out = anchor_patrol_person_boxes_to_faces(
                frame,
                [(legs, 0.6)],
                camera_id="HC-02",
            )
        self.assertEqual(out, [])


class TestFabricRejectedByAppearance(unittest.TestCase):
    """Bạt/tường bị loại ở _filter_persons (chạy trước anchor) bằng màu sắc —
    hình học không tách được bạt treo với người quay lưng."""

    @staticmethod
    def _frame_with(color_bgr, box):
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        x1, y1, x2, y2 = (int(v) for v in box)
        frame[y1:y2, x1:x2] = color_bgr
        return frame

    def test_green_tarp_and_gray_wall_rejected(self):
        from app.ppe_analyzer import _person_upper_body_signal

        box = (900.0, 80.0, 1100.0, 620.0)
        self.assertFalse(
            _person_upper_body_signal(self._frame_with((40, 140, 40), box), box)
        )
        self.assertFalse(
            _person_upper_body_signal(self._frame_with((150, 150, 150), box), box)
        )

    def test_person_kept_including_dark_clothing(self):
        from app.ppe_analyzer import _person_upper_body_signal

        box = (900.0, 80.0, 1100.0, 620.0)
        self.assertTrue(
            _person_upper_body_signal(self._frame_with((150, 190, 225), box), box)
        )
        # Quay lưng, mặc đồ tối — vẫn phải qua được.
        self.assertTrue(
            _person_upper_body_signal(self._frame_with((25, 25, 28), box), box)
        )


if __name__ == "__main__":
    unittest.main()
