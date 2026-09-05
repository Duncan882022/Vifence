"""Payload detection tuần tra — FE chỉ vẽ được ROI nếu ba trường này có mặt.

`track_id` để khoá ROI, `tier` để hiện nhãn Đối tượng/Người/Định danh, `velocity`
để nội suy giữa hai lần AI chạy. Thiếu bất kỳ trường nào là FE lại phải tự đoán
bằng IoU — đúng thứ đã gây ROI không bám người.
"""

from __future__ import annotations

import sys
import unittest
from dataclasses import dataclass
from pathlib import Path
from unittest.mock import patch

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.patrol import person_analyzer  # noqa: E402
from app.patrol_identity_lifecycle import reset as reset_lifecycle  # noqa: E402
from app.patrol_tracker import reset_patrol_trackers  # noqa: E402


@dataclass
class _FakeDetection:
    bbox: tuple[float, float, float, float]
    confidence: float


class _FakeDetector:
    """Trả đúng bộ bbox được nạp sẵn cho từng frame."""

    def __init__(self) -> None:
        self.next_boxes: list[_FakeDetection] = []

    def predict(self, _frame, *, conf=None):  # noqa: ANN001, ARG002
        return list(self.next_boxes)


class PatrolDetectionPayloadTests(unittest.TestCase):
    def setUp(self) -> None:
        reset_patrol_trackers()
        reset_lifecycle()
        self.detector = _FakeDetector()
        self.frame = np.zeros((540, 960, 3), dtype=np.uint8)
        self._patches = [
            patch.object(person_analyzer, "_get_person_detector", return_value=self.detector),
            # Mặt không đọc được từ frame đen — mọi người ở tầng Đối tượng, đủ để
            # kiểm hình dạng payload mà không phụ thuộc model nhận diện.
            patch(
                "app.worker_identity.recognizer.assess_patrol_face",
                return_value=(None, 0.0, False),
            ),
        ]
        for p in self._patches:
            p.start()

    def tearDown(self) -> None:
        for p in reversed(self._patches):
            p.stop()

    def _flycam_frame(self, boxes: list[_FakeDetection]) -> list[dict]:
        self.detector.next_boxes = boxes
        result = person_analyzer._build_patrol_flycam_aerial_result(self.frame, "DR-03")
        return [d for d in result["detections"] if d["behavior"] == "person"]

    def test_flycam_person_carries_track_tier_and_velocity(self) -> None:
        persons = self._flycam_frame([_FakeDetection((470, 250, 490, 300), 0.24)])
        self.assertEqual(len(persons), 1)

        det = persons[0]
        self.assertTrue(det["track_id"], "thiếu track_id thì FE phải đoán lại bằng IoU")
        self.assertEqual(det["tier"], "object")
        self.assertIsNotNone(det["velocity"])
        self.assertEqual(len(det["velocity"]), 2)

    def test_flycam_metrics_split_display_and_countable(self) -> None:
        """Flycam: ROI (display) tách khỏi KPI khung (detection gate)."""
        self.detector.next_boxes = [_FakeDetection((470, 250, 490, 300), 0.24)]
        result = person_analyzer._build_patrol_flycam_aerial_result(self.frame, "DR-03")
        metrics = result["metrics"]
        self.assertIn("display_person_count", metrics)
        self.assertIn("person_count", metrics)
        self.assertGreaterEqual(metrics["display_person_count"], 1)
        # Góc cao — silhouette nhỏ thường không qua detection gate chuẩn bodycam.
        self.assertGreaterEqual(metrics["display_person_count"], metrics["person_count"])

    def test_bodycam_metrics_include_display_person_count(self) -> None:
        self.detector.next_boxes = [_FakeDetection((380, 80, 520, 420), 0.55)]
        result = person_analyzer._build_patrol_bodycam_result(self.frame, "HC-01")
        metrics = result["metrics"]
        self.assertIn("display_person_count", metrics)
        self.assertGreaterEqual(metrics["display_person_count"], metrics["person_count"])

    def test_track_id_stable_while_person_crosses_frame(self) -> None:
        """Người đi ngang khung: một track duy nhất từ đầu tới cuối."""
        seen: list[str] = []
        for step in range(10):
            x = 200 + step * 55
            persons = self._flycam_frame(
                [_FakeDetection((x, 250, x + 20, 300), 0.24)],
            )
            self.assertEqual(len(persons), 1)
            seen.append(persons[0]["track_id"])

        self.assertEqual(len(set(seen)), 1, f"ID phải giữ nguyên, nhận được {set(seen)}")

    def test_two_people_keep_separate_tracks(self) -> None:
        left: list[str] = []
        right: list[str] = []
        for step in range(8):
            persons = self._flycam_frame([
                _FakeDetection((200 + step * 20, 250, 220 + step * 20, 300), 0.30),
                _FakeDetection((700 - step * 20, 250, 720 - step * 20, 300), 0.30),
            ])
            self.assertEqual(len(persons), 2)
            ids = sorted(d["track_id"] for d in persons)
            left.append(ids[0])
            right.append(ids[1])

        self.assertEqual(len(set(left)), 1)
        self.assertEqual(len(set(right)), 1)
        self.assertNotEqual(left[0], right[0])

    def test_velocity_follows_direction_of_travel(self) -> None:
        for step in range(6):
            x = 200 + step * 55
            persons = self._flycam_frame([_FakeDetection((x, 250, x + 20, 300), 0.30)])

        vx, _vy = persons[0]["velocity"]
        self.assertGreater(vx, 0.0, "đi sang phải thì vận tốc ngang phải dương")

    def test_overlay_uses_anchored_box_not_crowd_yolo(self) -> None:
        """ROI trả FE phải bám synth mặt — không vẽ lại bbox YOLO gom đám."""
        crowd = (80.0, 80.0, 1180.0, 680.0)
        synth = (360.0, 140.0, 540.0, 420.0)
        with patch(
            "app.patrol_face_anchor.anchor_patrol_person_boxes_to_faces",
            return_value=[(synth, 0.88)],
        ):
            self.detector.next_boxes = [_FakeDetection(crowd, 0.74)]
            result = person_analyzer._build_patrol_bodycam_result(self.frame, "HC-02")
        persons = [d for d in result["detections"] if d.behavior == "person"]
        self.assertEqual(len(persons), 1)
        det = persons[0]
        self.assertAlmostEqual(det.bbox[0], synth[0], delta=2.0)
        self.assertAlmostEqual(det.bbox[2], synth[2], delta=2.0)
        self.assertAlmostEqual(det.subject_bbox[0], crowd[0], delta=2.0)


if __name__ == "__main__":
    unittest.main()
