"""Tests Event Aggregator — Phase 1 + Phase 2."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

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
            now=140.0,
        )
        self.assertIsNotNone(reclaimed)
        self.assertEqual(reclaimed.session_id, "sess-cross-1")
        reset()

    def test_reclaim_after_long_gap_keeps_identity_not_appearance(self) -> None:
        reset()
        emb = tuple(0.01 * i for i in range(512))
        s1 = get_or_create("HC-02", "ptk-a", ts=100.0, face_embedding=emb)
        s1.session_id = "sess-merge-1"
        s1.subject_id = "pers-0001"
        s1.appearance_row_id = 99
        s1.identity_resolved = True
        stash_session(s1, embedding=emb)

        reclaimed = try_reclaim(
            "HC-02",
            bbox=(100.0, 100.0, 200.0, 400.0),
            embedding=emb,
            now=150.0,
        )
        self.assertIsNotNone(reclaimed)
        s2 = get_or_create("HC-02", "ptk-b", ts=150.0, face_embedding=emb)
        apply_reclaim(s2, reclaimed, now=150.0)
        self.assertEqual(s2.subject_id, "pers-0001")
        self.assertNotEqual(s2.session_id, "sess-merge-1")
        self.assertIsNone(s2.appearance_row_id)
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
            now=140.0,
        )
        self.assertIsNotNone(reclaimed)
        self.assertEqual(reclaimed.session_id, "sess-merge-1")

        s2 = get_or_create("HC-02", "ptk-b", ts=140.0, face_embedding=emb)
        apply_reclaim(s2, reclaimed, now=140.0)
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


class AggregatorIdentityPromoteTest(unittest.TestCase):
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

    def test_promote_obj_when_identity_already_resolved(self) -> None:
        """obj-* đã flush nhưng gallery resolve sau → promote sang pers-*."""
        from app.patrol import daystore, db, identity
        from app.patrol.aggregator.identity_pipeline import process_identity
        from app.patrol.aggregator.session_store import get_or_create
        from app.patrol.aggregator.types import IdentityType, ObservationInput, PersonIdentity

        ts = 1_000.0
        pers_id = identity.ensure_draft_for_tk("tk-0000042", now=ts)
        obj_id = daystore.touch_object(None, camera_id="HC-01", now=ts)
        session = get_or_create("HC-01", "ptk-promote", ts=ts)
        session.subject_id = obj_id
        session.identity_resolved = True
        session.identity = PersonIdentity(
            person_id="sgc-6688",
            identity_type=IdentityType.ANONYMOUS,
            confidence=0.85,
        )

        obs = ObservationInput(
            camera_id="HC-01",
            track_id="ptk-promote",
            ts=ts + 5,
            lifecycle_tier="person",
            lifecycle_worker_id="sgc-6688",
            confidence=0.85,
            face_eligible=True,
        )
        with patch(
            "app.patrol.aggregator.identity_pipeline._ensure_pers_for_worker",
            return_value=pers_id,
        ):
            result = process_identity(session, obs)
        self.assertIsNotNone(result)
        assert result is not None
        self.assertTrue(result.startswith("tk-"))
        self.assertEqual(session.subject_id, result)
        self.assertEqual(daystore.list_objects(db.today_vn(ts)), [])

    def test_lifecycle_resolve_promotes_obj_on_first_pass(self) -> None:
        from app.patrol import daystore, db, identity
        from app.patrol.aggregator.identity_pipeline import process_identity
        from app.patrol.aggregator.session_store import get_or_create
        from app.patrol.aggregator.types import IdentityType, ObservationInput, PersonIdentity

        ts = 2_000.0
        pers_id = identity.ensure_draft_for_tk("tk-0000042", now=ts)
        obj_id = daystore.touch_object(None, camera_id="HC-01", now=ts)
        session = get_or_create("HC-01", "ptk-first", ts=ts)
        session.subject_id = obj_id

        obs = ObservationInput(
            camera_id="HC-01",
            track_id="ptk-first",
            ts=ts + 2,
            lifecycle_tier="person",
            lifecycle_worker_id="sgc-9901",
            confidence=0.9,
            face_eligible=True,
        )
        with patch(
            "app.patrol.aggregator.identity_pipeline._map_worker_to_identity",
            return_value=PersonIdentity(
                person_id="sgc-9901",
                identity_type=IdentityType.ANONYMOUS,
                confidence=0.9,
            ),
        ), patch(
            "app.patrol.aggregator.identity_pipeline._ensure_pers_for_worker",
            return_value=pers_id,
        ):
            result = process_identity(session, obs)
        self.assertIsNotNone(result)
        assert result is not None
        self.assertTrue(result.startswith("tk-"))
        self.assertTrue(session.identity_resolved)
        self.assertEqual(daystore.list_objects(db.today_vn(ts)), [])

    def test_upgrade_anonymous_pers_to_identified_profile(self) -> None:
        """sgc pers-* tạm → gallery khớp Duncan — gộp một thẻ, giữ hồ sơ identified."""
        from app.patrol import daystore, db, identity
        from app.patrol.aggregator.identity_pipeline import process_identity
        from app.patrol.aggregator.session_store import get_or_create
        from app.patrol.aggregator.types import IdentityType, ObservationInput, PersonIdentity

        ts = 3_000.0
        duncan = identity.ensure_identified_for_gallery(
            "p-SGC-6688",
            full_name="Duncan",
            employee_code="NV6688",
            contractor="SGC",
            identified_by="test",
            now=ts,
        )
        stray = identity.ensure_draft_for_tk("tk-0000099", now=ts)
        daystore.touch_person_event(stray, camera_id="HC-01", now=ts, face_eligible=True)

        session = get_or_create("HC-01", "ptk-duncan", ts=ts)
        session.subject_id = stray
        session.identity_resolved = True
        session.identity = PersonIdentity(
            person_id=stray,
            identity_type=IdentityType.ANONYMOUS,
            confidence=0.85,
        )

        obs = ObservationInput(
            camera_id="HC-01",
            track_id="ptk-duncan",
            ts=ts + 2,
            lifecycle_tier="identity",
            lifecycle_worker_id="p-SGC-6688",
            confidence=0.95,
        )
        with patch(
            "app.patrol.aggregator.identity_pipeline._ensure_pers_for_worker",
            return_value=duncan,
        ):
            process_identity(session, obs)

        self.assertEqual(session.subject_id, duncan)
        cards = daystore.list_person_events(db.today_vn(ts))
        self.assertEqual(len(cards), 1)
        self.assertEqual(cards[0]["pers_id"], duncan)
        self.assertEqual(cards[0]["status"], identity.STATUS_IDENTIFIED)
        self.assertEqual(identity.resolve_alias(stray), duncan)

    def test_back_turn_lifecycle_worker_stays_object_without_face(self) -> None:
        """ROI gán sgc trên lưng — không tạo pers-* / daily_events."""
        from unittest.mock import patch

        from app.patrol import daystore, db
        from app.patrol.aggregator.engine import finalize_track, ingest_observation

        ts = 4_000.0
        with patch(
            "app.patrol.aggregator.flush._gate_observation_commit",
            return_value=(True, ts),
        ), patch(
            "app.patrol.aggregator.flush._write_snapshot",
            return_value=("obj.jpg", 0.5),
        ):
            ingest_observation(
                camera_id="HC-01",
                track_id="ptk-back",
                now=ts,
                lifecycle_tier="person",
                lifecycle_worker_id="sgc-8800",
                confidence=0.85,
                face_eligible=False,
            )
            finalize_track("HC-01", "ptk-back", now=ts + 5.0)

        date = db.today_vn(ts)
        self.assertEqual(daystore.list_person_events(date), [])
        self.assertEqual(len(daystore.list_objects(date)), 1)
        stats = daystore.day_stats(date)
        self.assertEqual(stats["workers_standard"], 0)
        self.assertGreaterEqual(stats["unassigned_observations"], 1)


class AggregatorContinuousPresenceTest(unittest.TestCase):
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

    def test_standing_in_frame_does_not_create_repeat_appearances(self) -> None:
        """Còn trong khung — một lần chốt; không INSERT appearance liên tục."""
        from unittest.mock import patch

        from app.patrol import daystore, db
        from app.patrol.aggregator.engine import ingest_observation, finalize_track

        ts = 5_000.0
        with patch(
            "app.patrol.aggregator.flush._gate_observation_commit",
            return_value=(True, ts),
        ), patch(
            "app.patrol.aggregator.identity_pipeline._ensure_pers_for_worker",
            return_value="tk-0000001",
        ), patch(
            "app.patrol.aggregator.identity_pipeline._map_worker_to_identity",
            return_value=PersonIdentity(
                person_id="sgc-7001",
                identity_type=IdentityType.ANONYMOUS,
                confidence=0.9,
            ),
        ), patch(
            "app.patrol.aggregator.flush._write_snapshot",
            return_value=(None, 0.0),
        ):
            from app.patrol import identity

            identity.ensure_draft_for_tk("tk-0000001", now=ts)
            for i in range(30):
                ingest_observation(
                    camera_id="HC-01",
                    track_id="ptk-stand",
                    now=ts + i * 0.5,
                    lifecycle_tier="person",
                    lifecycle_worker_id="sgc-7001",
                    confidence=0.9,
                )

        rows = daystore.list_day_presences(db.today_vn(ts))
        self.assertEqual(len(rows), 1)

        finalize_track("HC-01", "ptk-stand", now=ts + 20.0)
        rows_after = daystore.list_day_presences(db.today_vn(ts))
        self.assertEqual(len(rows_after), 1)
        # ended_at = lần quan sát cuối, không kéo tới lúc finalize muộn.
        self.assertAlmostEqual(float(rows_after[0]["ended_at"]), ts + 14.5, places=3)

    def test_dwell_gate_retries_until_committed(self) -> None:
        """Frame đầu chưa đủ dwell — ingest tiếp vẫn phải chốt được."""
        from unittest.mock import patch

        from app.patrol import daystore, db
        from app.patrol.aggregator.engine import ingest_observation

        ts = 6_000.0
        gate_calls = {"n": 0}

        def _gate(key, *, has_face, now):  # noqa: ANN001
            gate_calls["n"] += 1
            return gate_calls["n"] >= 3, ts

        with patch(
            "app.patrol.aggregator.flush._gate_observation_commit",
            side_effect=_gate,
        ), patch(
            "app.patrol.aggregator.identity_pipeline._map_worker_to_identity",
            return_value=PersonIdentity(
                person_id="sgc-7002",
                identity_type=IdentityType.ANONYMOUS,
                confidence=0.9,
            ),
        ), patch(
            "app.patrol.aggregator.identity_pipeline._ensure_pers_for_worker",
            return_value="tk-0000001",
        ), patch(
            "app.patrol.aggregator.flush._write_snapshot",
            return_value=(None, 0.0),
        ):
            from app.patrol import identity

            identity.ensure_draft_for_tk("tk-0000001", now=ts)
            for i in range(5):
                ingest_observation(
                    camera_id="HC-01",
                    track_id="ptk-dwell",
                    now=ts + i * 0.2,
                    lifecycle_tier="person",
                    lifecycle_worker_id="sgc-7002",
                    confidence=0.9,
                )

        rows = daystore.list_day_presences(db.today_vn(ts))
        self.assertEqual(len(rows), 1)


class AggregatorSplitTrackCoalesceTest(unittest.TestCase):
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

    def test_link_subject_session_shares_appearance_row(self) -> None:
        from app.patrol.aggregator.session_store import get_or_create, link_subject_session

        tk_id = "tk-0000007"
        s1 = get_or_create("HC-02", "ptk0001", ts=1000.0)
        s1.subject_id = tk_id
        s1.appearance_row_id = 42
        s1.session_id = "sess-shared"
        s1.committed = True

        s2 = get_or_create("HC-02", "ptk0002", ts=1020.0)
        s2.subject_id = tk_id
        link_subject_session(s2)

        self.assertEqual(s2.appearance_row_id, 42)
        self.assertEqual(s2.session_id, "sess-shared")
        self.assertTrue(s2.committed)

    def test_upsert_coalesces_second_track_same_subject(self) -> None:
        from app.patrol import daystore, db

        row1 = daystore.upsert_track_appearance(
            appearance_id=None,
            event_date="2026-08-30",
            subject_id="tk-0000007",
            camera_id="HC-02",
            zone_id=None,
            track_id="ptk0001",
            session_id="sess-1",
            started_at=1000.0,
            ended_at=1024.0,
            gps_lat=20.93,
            gps_lng=106.92,
            payload_json="{}",
            interactions_json="[]",
            snapshot_path="2026-08-30/tk-0000007-1000.jpg",
        )
        row2 = daystore.upsert_track_appearance(
            appearance_id=None,
            event_date="2026-08-30",
            subject_id="tk-0000007",
            camera_id="HC-02",
            zone_id=None,
            track_id="ptk0002",
            session_id="sess-2",
            started_at=1022.0,
            ended_at=1025.0,
            gps_lat=20.93,
            gps_lng=106.92,
            payload_json="{}",
            interactions_json="[]",
            snapshot_path="2026-08-30/tk-0000007-1025.jpg",
        )
        self.assertEqual(row1, row2)
        rows = daystore.list_day_presences("2026-08-30")
        self.assertEqual(len(rows), 1)
        snap = db.query_one(
            "SELECT snapshot_path FROM appearances WHERE id = ?",
            (row1,),
        )
        self.assertEqual(snap["snapshot_path"], "2026-08-30/tk-0000007-1025.jpg")

    def test_coalesce_merges_duplicate_rows(self) -> None:
        from app.patrol import daystore, db

        daystore.upsert_track_appearance(
            appearance_id=None,
            event_date="2026-08-30",
            subject_id="tk-0000007",
            camera_id="HC-02",
            zone_id=None,
            track_id="ptk-a",
            session_id="sess-a",
            started_at=1000.0,
            ended_at=1020.0,
            gps_lat=20.93,
            gps_lng=106.92,
            payload_json="{}",
            interactions_json="[]",
            snapshot_path="snap-a.jpg",
        )
        with db.tx() as conn:
            conn.execute(
                "INSERT INTO appearances"
                "(event_date, subject_id, camera_id, started_at, ended_at,"
                " gps_lat, gps_lng, gps_lat_end, gps_lng_end, qualified,"
                " presence_seq, source_cameras, snapshot_path, track_id,"
                " session_id, counted, event_payload_json, interactions_json)"
                " VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    "2026-08-30",
                    "tk-0000007",
                    "HC-02",
                    1022.0,
                    1025.0,
                    20.93,
                    106.92,
                    20.93,
                    106.92,
                    1,
                    2,
                    '["HC-02"]',
                    "snap-b.jpg",
                    "ptk-b",
                    "sess-b",
                    0,
                    "{}",
                    "[]",
                ),
            )
        merged = daystore.coalesce_subject_appearances(
            "tk-0000007", "2026-08-30", camera_id="HC-02",
        )
        self.assertEqual(merged, 1)
        rows = daystore.list_day_presences("2026-08-30")
        self.assertEqual(len(rows), 1)


class AggregatorSnapshotFlushTest(unittest.TestCase):
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

    def test_flush_extends_appearance_still_writes_object_snapshot(self) -> None:
        """Gộp appearance không được chặn chụp — Đối tượng phải có JPG trên thẻ."""
        import numpy as np
        from unittest.mock import patch

        from app.patrol import daystore, db
        from app.patrol.aggregator.flush import flush_session
        from app.patrol.aggregator.session_store import get_or_create
        from app.patrol.aggregator.types import ObservationInput

        ts = 7_000.0
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        bbox = (100.0, 80.0, 220.0, 400.0)
        session = get_or_create("HC-02", "ptk-obj", ts=ts)
        row_id = daystore.upsert_track_appearance(
            appearance_id=None,
            event_date=db.today_vn(ts),
            subject_id="obj-20260830-0099",
            camera_id="HC-02",
            zone_id=None,
            track_id="ptk-obj",
            session_id="sess-obj",
            started_at=ts - 5,
            ended_at=ts - 1,
            gps_lat=20.93,
            gps_lng=106.92,
            payload_json="{}",
            interactions_json="[]",
            snapshot_path="2026-08-30/old.jpg",
        )
        daystore.touch_object(
            "obj-20260830-0099",
            camera_id="HC-02",
            snapshot_path="2026-08-30/old.jpg",
            snapshot_score=0.5,
            now=ts - 1,
            skip_appearance=True,
        )
        session.subject_id = "obj-20260830-0099"
        session.appearance_row_id = row_id
        session.committed = True
        session.last_flush_at = ts - 1
        session.dirty = True

        obs = ObservationInput(
            camera_id="HC-02",
            track_id="ptk-obj",
            ts=ts + 12,
            person_bbox=bbox,
            frame=frame,
            confidence=0.85,
        )
        with patch(
            "app.patrol.sink._write_snapshot",
            return_value="2026-08-30/obj-new.jpg",
        ) as write_mock:
            flush_session(session, obs)

        write_mock.assert_called()
        obj = daystore.list_objects(db.today_vn(ts))[0]
        self.assertEqual(obj["snapshot_path"], "2026-08-30/obj-new.jpg")
        snap = db.query_one(
            "SELECT snapshot_path FROM appearances WHERE id = ?",
            (row_id,),
        )
        self.assertEqual(snap["snapshot_path"], "2026-08-30/obj-new.jpg")


class ObjectFacePromoteTests(unittest.TestCase):
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

    def test_stale_identity_resolved_still_promotes_object_with_face(self) -> None:
        """obj đã chốt + identity_resolved nhầm — thấy mặt sau vẫn lên Người."""
        import numpy as np

        from app.patrol import daystore, db
        from app.patrol.aggregator.identity_pipeline import process_identity
        from app.patrol.aggregator.session_store import get_or_create
        from app.patrol.aggregator.types import IdentityType, ObservationInput, PersonIdentity

        ts = 8_000.0
        obj_id = daystore.touch_object(None, camera_id="HC-01", now=ts)
        session = get_or_create("HC-01", "ptk-face", ts=ts + 10)
        session.subject_id = obj_id
        session.committed = True
        session.identity_resolved = True
        session.identity = PersonIdentity(identity_type=IdentityType.UNKNOWN)

        emb = tuple(float(x) for x in np.zeros(128, dtype=np.float32))
        emb = tuple(emb[i] + (1.0 if i == 3 else 0.0) for i in range(128))
        obs = ObservationInput(
            camera_id="HC-01",
            track_id="ptk-face",
            ts=ts + 12,
            face_embedding=emb,
            face_quality=0.88,
            face_eligible=True,
            confidence=0.85,
        )
        process_identity(session, obs)
        self.assertTrue(str(session.subject_id).startswith("tk-"))
        self.assertEqual(daystore.list_objects(db.today_vn(ts)), [])


if __name__ == "__main__":
    unittest.main()
