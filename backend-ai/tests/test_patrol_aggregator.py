"""Tests Event Aggregator — Phase 1 + Phase 2."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from app.patrol.aggregator.behavior_pipeline import process_behavior
from app.patrol.aggregator.lost_track_memory import apply_reclaim, stash_session, try_reclaim
from app.patrol.aggregator.serialize import build_event_payload
from app.patrol.aggregator.session_store import get_or_create, pop_session, reset
from app.patrol.aggregator.tripwire import site_entry_counted
from app.patrol.aggregator.types import IdentityType, ObservationInput, PersonIdentity
from app.patrol_site_geometry import PATROL_SITE_CENTER


class AggregatorSerializeTest(unittest.TestCase):
    def test_event_payload_shape(self) -> None:
        session = get_or_create("HC-02", "ptk-10293", ts=1_000.0)
        session.identity = PersonIdentity(
            person_id="p-8820",
            identity_type=IdentityType.KNOWN,
            confidence=0.92,
        )
        session.subject_id = "pers-0001"
        session.session_id = "sess-HC-02-abc"
        session.counted = True
        session.started_at = 1_000.0
        session.last_seen_at = 1_015.0
        payload = build_event_payload(session)
        self.assertEqual(payload["track_id"], "ptk-10293")
        self.assertEqual(payload["session_id"], "sess-HC-02-abc")
        self.assertTrue(payload["counted"])
        self.assertEqual(payload["person_identity"]["type"], "KNOWN")
        self.assertEqual(payload["person_identity"]["confidence"], 0.92)
        self.assertEqual(payload["appearance_span"]["duration_seconds"], 15)
        reset()


class AggregatorBehaviorTest(unittest.TestCase):
    def test_touch_dedupe_within_2s(self) -> None:
        session = get_or_create("HC-02", "ptk-1", ts=100.0)
        obs = ObservationInput(
            camera_id="HC-02",
            track_id="ptk-1",
            ts=100.0,
            touched_object_id="obj-01",
        )
        process_behavior(session, obs)
        process_behavior(session, ObservationInput(
            camera_id="HC-02",
            track_id="ptk-1",
            ts=101.0,
            touched_object_id="obj-01",
        ))
        self.assertEqual(len(session.interactions), 1)
        reset()

    def test_finalize_pops_session(self) -> None:
        get_or_create("HC-02", "ptk-2", ts=1.0)
        popped = pop_session("HC-02", "ptk-2")
        self.assertIsNotNone(popped)
        self.assertIsNone(pop_session("HC-02", "ptk-2"))


class AggregatorReIdTest(unittest.TestCase):
    def test_lost_track_reclaim_cross_camera(self) -> None:
        reset()
        emb = tuple(0.02 * i for i in range(512))
        s1 = get_or_create("HC-01", "ptk-a", ts=100.0, face_embedding=emb)
        s1.session_id = "sess-cross-1"
        s1.subject_id = "pers-0001"
        s1.identity_resolved = True
        stash_session(s1, embedding=emb)

        reclaimed = try_reclaim(
            "HC-02",
            bbox=(100.0, 100.0, 200.0, 400.0),
            embedding=emb,
            now=150.0,
        )
        self.assertIsNotNone(reclaimed)
        self.assertEqual(reclaimed.session_id, "sess-cross-1")
        reset()

    def test_lost_track_reclaim_by_embedding(self) -> None:
        reset()
        emb = tuple(0.01 * i for i in range(512))
        s1 = get_or_create("HC-02", "ptk-a", ts=100.0, face_embedding=emb)
        s1.session_id = "sess-merge-1"
        s1.subject_id = "pers-0001"
        s1.identity_resolved = True
        stash_session(s1, embedding=emb)

        reclaimed = try_reclaim(
            "HC-02",
            bbox=(100.0, 100.0, 200.0, 400.0),
            embedding=emb,
            now=150.0,
        )
        self.assertIsNotNone(reclaimed)
        self.assertEqual(reclaimed.session_id, "sess-merge-1")

        s2 = get_or_create("HC-02", "ptk-b", ts=150.0, face_embedding=emb)
        apply_reclaim(s2, reclaimed)
        self.assertEqual(s2.session_id, "sess-merge-1")
        self.assertEqual(s2.subject_id, "pers-0001")
        reset()


class AggregatorTripwireTest(unittest.TestCase):
    def test_site_entry_counts_once(self) -> None:
        session = get_or_create("HC-02", "ptk-tw", ts=1.0)
        lat, lng = PATROL_SITE_CENTER
        self.assertTrue(site_entry_counted(session, gps_lat=lat, gps_lng=lng))
        self.assertTrue(session.counted)
        self.assertFalse(site_entry_counted(session, gps_lat=lat, gps_lng=lng))
        reset()


class AggregatorDaystoreTest(unittest.TestCase):
    def setUp(self) -> None:
        from app.patrol import db, sink

        self._tmp = tempfile.TemporaryDirectory()
        db.close()
        db.DATA_DIR = Path(self._tmp.name)
        db.DB_FILE = Path(self._tmp.name) / "patrol.db"
        sink.SNAPSHOT_DIR = db.DATA_DIR / "patrol_snapshots"
        db.get_conn()

    def tearDown(self) -> None:
        from app.patrol import db

        db.close()
        self._tmp.cleanup()

    def test_upsert_track_appearance_updates_same_row(self) -> None:
        from app.patrol import daystore

        row1 = daystore.upsert_track_appearance(
            appearance_id=None,
            event_date="2026-08-30",
            subject_id="obj-20260830-0001",
            camera_id="HC-02",
            zone_id=None,
            track_id="ptk-99",
            session_id="sess-HC-02-test",
            started_at=1000.0,
            ended_at=1005.0,
            gps_lat=20.93,
            gps_lng=106.92,
            payload_json='{"track_id":"ptk-99"}',
            interactions_json="[]",
            counted=True,
        )
        row2 = daystore.upsert_track_appearance(
            appearance_id=row1,
            event_date="2026-08-30",
            subject_id="obj-20260830-0001",
            camera_id="HC-02",
            zone_id=None,
            track_id="ptk-99",
            session_id="sess-HC-02-test",
            started_at=1000.0,
            ended_at=1020.0,
            gps_lat=20.94,
            gps_lng=106.93,
            payload_json='{"track_id":"ptk-99","end":true}',
            interactions_json='[{"object_id":"obj-01","action":"touch"}]',
            counted=True,
            finalize=True,
        )
        self.assertEqual(row1, row2)
        rows = daystore.list_day_presences("2026-08-30")
        self.assertEqual(len(rows), 1)
        self.assertAlmostEqual(float(rows[0]["ended_at"]), 1020.0, places=3)
        self.assertEqual(rows[0]["session_id"], "sess-HC-02-test")
        self.assertEqual(int(rows[0]["counted"]), 1)


if __name__ == "__main__":
    unittest.main()
