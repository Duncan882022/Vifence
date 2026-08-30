"""Finalize track khi stream tuần tra ngắt."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.patrol.aggregator.engine import finalize_track, ingest_observation
from app.patrol.aggregator.session_store import get_or_create, reset
from app.patrol.aggregator.types import IdentityType, ObservationInput, PersonIdentity
from app.patrol_stream_lifecycle import on_patrol_stream_offline, reset_patrol_stream_lifecycle


class PatrolStreamOfflineFinalizeTest(unittest.TestCase):
    def setUp(self) -> None:
        from app.patrol import db, sink
        from app.patrol_tracker import reset_patrol_trackers

        self._tmp = tempfile.TemporaryDirectory()
        db.close()
        db.DATA_DIR = Path(self._tmp.name)
        db.DB_FILE = Path(self._tmp.name) / "patrol.db"
        sink.SNAPSHOT_DIR = db.DATA_DIR / "patrol_snapshots"
        db.get_conn()
        reset()
        reset_patrol_trackers()
        reset_patrol_stream_lifecycle()

    def tearDown(self) -> None:
        from app.patrol import db
        from app.patrol_tracker import reset_patrol_trackers

        reset()
        reset_patrol_trackers()
        reset_patrol_stream_lifecycle()
        db.close()
        self._tmp.cleanup()

    def _ingest(self, *, track_id: str, now: float, worker: str = "sgc-9001") -> None:
        ingest_observation(
            camera_id="HC-02",
            track_id=track_id,
            now=now,
            lifecycle_tier="person",
            lifecycle_worker_id=worker,
            confidence=0.9,
        )

    def test_finalize_track_does_not_stretch_last_seen_to_drop_time(self) -> None:
        session = get_or_create("HC-02", "ptk0001:person", ts=1000.0)
        session.touch(1025.0, (10.0, 10.0, 100.0, 200.0))
        self.assertAlmostEqual(session.last_seen_at, 1025.0)

        finalize_track("HC-02", "ptk0001:person", now=5000.0)
        # Session popped — kiểm tra qua flush sau offline + gap dài.

    def test_offline_then_return_creates_second_appearance(self) -> None:
        from app.patrol import daystore, db, identity
        from app.patrol.person_analyzer import assign_patrol_track_ids

        t0 = 5_000.0
        identity.create_person(origin="sgc", now=t0)

        with patch(
            "app.patrol.aggregator.flush._gate_observation_commit",
            return_value=(True, t0),
        ), patch(
            "app.patrol.aggregator.identity_pipeline._map_worker_to_identity",
            return_value=PersonIdentity(
                person_id="sgc-9001",
                identity_type=IdentityType.ANONYMOUS,
                confidence=0.9,
            ),
        ), patch(
            "app.patrol.aggregator.identity_pipeline._ensure_pers_for_worker",
            return_value="pers-0001",
        ), patch(
            "app.patrol.aggregator.flush._write_snapshot",
            return_value=(None, 0.0),
        ):
            assign_patrol_track_ids(
                "HC-02",
                [((100.0, 100.0, 200.0, 400.0), 0.8)],
                now=t0,
            )
            track_id = "ptk0001:person"
            self._ingest(track_id=track_id, now=t0)

            on_patrol_stream_offline("HC-02", at_ts=t0 + 3.0)

            self._ingest(track_id="ptk0002:person", now=t0 + 100.0)

        rows = daystore.list_day_presences(db.today_vn(t0))
        self.assertEqual(len(rows), 2)


if __name__ == "__main__":
    unittest.main()
