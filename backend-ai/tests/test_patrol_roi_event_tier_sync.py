"""ROI tier Người/Định danh phải ghi thẻ pers-* — không lệch sang obj-*."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from app.patrol import daystore, db, sink

_FACE_CONFIRM = 1.5


class PatrolRoiEventTierSyncTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        db.close()
        db.DATA_DIR = Path(self._tmp.name)
        db.DB_FILE = Path(self._tmp.name) / "patrol.db"
        db.get_conn()
        sink.reset()

    def tearDown(self) -> None:
        sink.reset()
        db.close()
        self._tmp.cleanup()

    def test_sgc_lifecycle_without_face_logs_person(self) -> None:
        t0 = 1_000.0
        self.assertIsNone(
            sink.record_observation(
                camera_id="DR-03",
                track_id="ptk0099:person",
                lifecycle_tier="person",
                lifecycle_worker_id="sgc-00000539",
                confidence=0.5,
                now=t0,
            ),
        )
        pers = sink.record_observation(
            camera_id="DR-03",
            track_id="ptk0099:person",
            lifecycle_tier="person",
            lifecycle_worker_id="sgc-00000539",
            confidence=0.5,
            now=t0 + _FACE_CONFIRM,
        )
        self.assertTrue(str(pers).startswith("pers-"))
        self.assertEqual(len(daystore.list_objects(db.today_vn(t0))), 0)
        self.assertEqual(len(daystore.list_person_events(db.today_vn(t0))), 1)

    def test_repeated_sgc_reuses_same_pers(self) -> None:
        t0 = 2_000.0
        first = sink.record_observation(
            camera_id="HC-01",
            track_id="ptk0100:person",
            lifecycle_tier="person",
            lifecycle_worker_id="sgc-00000007",
            now=t0 + _FACE_CONFIRM,
        )
        second = sink.record_observation(
            camera_id="HC-02",
            track_id="ptk0200:person",
            lifecycle_tier="person",
            lifecycle_worker_id="sgc-00000007",
            now=t0 + _FACE_CONFIRM + 5,
        )
        self.assertEqual(first, second)


if __name__ == "__main__":
    unittest.main()
