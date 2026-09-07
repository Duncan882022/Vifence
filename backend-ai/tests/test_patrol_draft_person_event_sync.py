"""Hồ sơ draft tk-* luôn có thẻ Người; mặt partial không cấp mã mới."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.patrol import daystore, db, identity, sink  # noqa: E402
from app.patrol_person_visibility import patrol_reidentifiable_face_allowed  # noqa: E402


class DraftPersonEventSyncTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        db.close()
        db.DATA_DIR = Path(self._tmp.name)
        db.DB_FILE = Path(self._tmp.name) / "patrol.db"
        sink.SNAPSHOT_DIR = db.DATA_DIR / "patrol_snapshots"
        db.get_conn()
        sink.reset()

    def tearDown(self) -> None:
        sink.reset()
        db.close()
        self._tmp.cleanup()

    def test_ensure_draft_creates_daily_event(self) -> None:
        t0 = 2_000.0
        identity.ensure_draft_for_tk(
            "tk-0000001",
            now=t0,
            camera_id="HC-01",
            face_eligible=True,
        )
        date = db.today_vn(t0)
        cards = daystore.list_person_events(date)
        self.assertEqual(len(cards), 1)
        self.assertEqual(cards[0]["pers_id"], "tk-0000001")

    def test_partial_face_below_bodycam_min_not_reidentifiable(self) -> None:
        fw, fh = 1280, 720
        bbox = (fw * 0.35, fh * 0.15, fw * 0.65, fh * 0.75)
        self.assertFalse(
            patrol_reidentifiable_face_allowed(
                bbox,
                fw,
                fh,
                face_detect_score=0.58,
                face_eligible=True,
                camera_id="HC-01",
            ),
        )
        self.assertTrue(
            patrol_reidentifiable_face_allowed(
                bbox,
                fw,
                fh,
                face_detect_score=0.65,
                face_eligible=True,
                camera_id="HC-01",
            ),
        )


if __name__ == "__main__":
    unittest.main()
