"""Peak time — đám đông: lượt gặm N + 1 thẻ snapshot nhóm; mặt rõ vẫn định danh."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.config import settings
from app.patrol import db
from app.patrol import daystore
from app.patrol.peak_time import (
    PeakCrowdMember,
    assign_peak_crowd_detection_fields,
    is_peak_time,
    peak_identity_allowed,
    record_peak_crowd_frame,
    reset_peak_time,
    update_peak_time_density,
)
from app.schemas import PpeDetection


class PatrolPeakTimeTest(unittest.TestCase):
    def setUp(self) -> None:
        reset_peak_time()
        self._prev = settings.patrol_peak_time_enabled
        settings.patrol_peak_time_enabled = True
        self._tmpdir = tempfile.TemporaryDirectory()
        self._old_db = db.DB_FILE
        self._old_data = db.DATA_DIR
        db.DB_FILE = Path(self._tmpdir.name) / "peak_test.db"
        db.DATA_DIR = Path(self._tmpdir.name)
        db.close()
        db.get_conn()

    def tearDown(self) -> None:
        settings.patrol_peak_time_enabled = self._prev
        reset_peak_time()
        db.close()
        db.DB_FILE = self._old_db
        db.DATA_DIR = self._old_data
        self._tmpdir.cleanup()

    def test_enter_at_30_exit_at_25_hysteresis(self) -> None:
        self.assertFalse(update_peak_time_density("HC-01", 29))
        self.assertTrue(update_peak_time_density("HC-01", 30))
        self.assertTrue(is_peak_time("HC-01"))
        self.assertTrue(update_peak_time_density("HC-01", 28))
        self.assertTrue(is_peak_time("HC-01"))
        self.assertFalse(update_peak_time_density("HC-01", 25))
        self.assertFalse(is_peak_time("HC-01"))

    def test_peak_identity_requires_face_score(self) -> None:
        self.assertFalse(
            peak_identity_allowed(face_eligible=False, face_quality=0.9, confidence=0.9),
        )
        self.assertFalse(
            peak_identity_allowed(face_eligible=True, face_quality=0.2, confidence=0.2),
        )
        self.assertTrue(
            peak_identity_allowed(face_eligible=True, face_quality=0.8, confidence=0.9),
        )

    def test_crowd_frame_uses_single_group_card_id(self) -> None:
        members = [
            PeakCrowdMember(track_id="t1", person_bbox=[10, 10, 50, 80], confidence=0.7),
            PeakCrowdMember(track_id="t2", person_bbox=[60, 10, 100, 80], confidence=0.8),
        ]
        import numpy as np

        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        with patch("app.patrol.sink._maybe_write_snapshot", return_value="snap.jpg"):
            with patch("app.patrol.sink._resolve_observation_gps", return_value=(None, None)):
                obj1 = record_peak_crowd_frame("HC-01", members, frame, now=1_000.0)
                obj2 = record_peak_crowd_frame("HC-01", members, frame, now=1_005.0)
        self.assertTrue(obj1)
        self.assertEqual(obj1, obj2)

    def test_crowd_frame_does_not_increment_unassigned_observations(self) -> None:
        members = [
            PeakCrowdMember(track_id="t1", person_bbox=[10, 10, 50, 80], confidence=0.7),
            PeakCrowdMember(track_id="t2", person_bbox=[60, 10, 100, 80], confidence=0.8),
        ]
        import numpy as np

        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        with patch("app.patrol.sink._maybe_write_snapshot", return_value="snap.jpg"):
            with patch("app.patrol.sink._resolve_observation_gps", return_value=(None, None)):
                record_peak_crowd_frame("HC-01", members, frame, now=1_000.0)
        stats = daystore.day_stats(db.today_vn(1_000.0))
        self.assertEqual(stats["unassigned_observations"], 0)
        self.assertEqual(stats["object_card_count"], 1)

    def test_density_encounters_increment_unassigned_by_member_count(self) -> None:
        from app.patrol.aggregator.engine import finalize_track, ingest_observation

        import numpy as np

        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        with patch(
            "app.patrol.aggregator.flush._gate_observation_commit",
            return_value=(True, 2_000.0),
        ), patch(
            "app.patrol.aggregator.tripwire.site_entry_counted",
            return_value=True,
        ), patch(
            "app.patrol.aggregator.flush._write_snapshot",
            return_value=(None, 0.0),
        ):
            for i in range(3):
                ts = 2_000.0 + i * 10
                bbox = [10.0 + i * 80.0, 10.0, 50.0 + i * 80.0, 80.0]
                ingest_observation(
                    camera_id="HC-01",
                    track_id=f"ptk-crowd-{i}",
                    frame=frame,
                    person_bbox=bbox,
                    density_only=True,
                    now=ts,
                    confidence=0.8,
                )
                finalize_track("HC-01", f"ptk-crowd-{i}", now=ts + 5.0)
        stats = daystore.day_stats(db.today_vn(2_000.0))
        self.assertEqual(stats["unassigned_observations"], 3)

    def test_assign_peak_crowd_numbering(self) -> None:
        members = [
            PeakCrowdMember(track_id="t2", person_bbox=[200, 10, 240, 80], confidence=0.7),
            PeakCrowdMember(track_id="t1", person_bbox=[10, 10, 50, 80], confidence=0.8),
        ]
        dets = [
            PpeDetection(
                behavior="person",
                label="person",
                scenario_id="PATROL-PERSON",
                confidence=0.7,
                bbox=[10, 10, 50, 80],
                track_id="t1",
            ),
            PpeDetection(
                behavior="person",
                label="person",
                scenario_id="PATROL-PERSON",
                confidence=0.8,
                bbox=[200, 10, 240, 80],
                track_id="t2",
            ),
        ]
        assign_peak_crowd_detection_fields(dets, members, "obj-20260831-0001")
        by_track = {d.track_id: d for d in dets}
        self.assertEqual(by_track["t1"].peak_group_index, 1)
        self.assertEqual(by_track["t2"].peak_group_index, 2)
        self.assertTrue(by_track["t1"].peak_group)
        self.assertEqual(by_track["t1"].peak_group_size, 2)
        self.assertEqual(by_track["t1"].worker_id, "obj-20260831-0001")


if __name__ == "__main__":
    unittest.main()
