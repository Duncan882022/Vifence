"""Lifecycle best face — snapshot Người dùng khung mặt tốt nhất, không lưng cuối."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.patrol.aggregator.flush import (  # noqa: E402
    _lifecycle_best_face_observation,
    _snapshot_observation,
    write_person_card,
)
from app.patrol.aggregator.identity_pipeline import _note_best_frame  # noqa: E402
from app.patrol.aggregator.session_store import get_or_create, reset  # noqa: E402
from app.patrol.aggregator.types import ObservationInput  # noqa: E402


class LifecycleBestFaceSnapshotTest(unittest.TestCase):
    def setUp(self) -> None:
        from app.patrol import db, sink

        self._tmp = tempfile.TemporaryDirectory()
        db.close()
        db.DATA_DIR = Path(self._tmp.name)
        db.DB_FILE = Path(self._tmp.name) / "patrol.db"
        sink.SNAPSHOT_DIR = db.DATA_DIR / "patrol_snapshots"
        db.get_conn()
        reset()

    def tearDown(self) -> None:
        from app.patrol import db

        reset()
        db.close()
        self._tmp.cleanup()

    def test_snapshot_observation_prefers_best_face_over_back_turn(self) -> None:
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        session = get_or_create("HC-01", "ptk-face", ts=100.0)
        face_obs = ObservationInput(
            camera_id="HC-01",
            track_id="ptk-face",
            ts=100.5,
            person_bbox=(400.0, 80.0, 520.0, 520.0),
            frame=frame,
            face_eligible=True,
            face_quality=0.72,
            face_embedding=tuple(0.01 for _ in range(128)),
            confidence=0.55,
        )
        back_obs = ObservationInput(
            camera_id="HC-01",
            track_id="ptk-face",
            ts=101.0,
            person_bbox=(400.0, 80.0, 520.0, 520.0),
            frame=frame,
            face_eligible=False,
            face_quality=0.0,
            confidence=0.92,
        )
        _note_best_frame(session, face_obs)
        session.best_observation = back_obs
        session.best_observation_score = 0.92

        picked = _snapshot_observation(session, back_obs)
        self.assertTrue(picked.face_eligible)
        self.assertAlmostEqual(float(picked.face_quality), 0.72, places=2)
        self.assertIsNotNone(_lifecycle_best_face_observation(session))

    def test_write_person_card_uses_lifecycle_best_face_on_finalize(self) -> None:
        """Quay lưng lúc finalize — vẫn chụp từ best face đã lưu trong session."""
        from app.patrol.aggregator.flush import write_person_card

        frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        session = get_or_create("HC-01", "ptk-wpc", ts=200.0)
        session.mark_person_committed("tk-0000101")
        face_obs = ObservationInput(
            camera_id="HC-01",
            track_id="ptk-wpc",
            ts=200.5,
            person_bbox=(400.0, 80.0, 520.0, 520.0),
            frame=frame,
            face_eligible=True,
            face_quality=0.74,
            face_embedding=tuple(0.01 for _ in range(128)),
            confidence=0.52,
        )
        _note_best_frame(session, face_obs)
        back_obs = ObservationInput(
            camera_id="HC-01",
            track_id="ptk-wpc",
            ts=201.0,
            person_bbox=(400.0, 80.0, 520.0, 520.0),
            frame=frame,
            face_eligible=False,
            face_quality=0.0,
            confidence=0.91,
        )

        with patch(
            "app.patrol.aggregator.flush._write_snapshot",
            return_value=("2026-09-07/tk.jpg", 1.50),
        ) as mock_write, patch(
            "app.patrol.aggregator.flush.daystore.touch_person_event",
        ):
            write_person_card(session, back_obs, finalize=True)

        self.assertTrue(mock_write.called)
        shot_session, shot_obs = mock_write.call_args[0]
        self.assertIs(shot_session, session)
        self.assertTrue(shot_obs.face_eligible)
        self.assertAlmostEqual(float(shot_obs.face_quality), 0.74, places=2)


if __name__ == "__main__":
    unittest.main()
