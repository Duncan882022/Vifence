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
        s2 = get_or_create("HC-02", "ptk-b", ts=140.0, face_embedding=emb)
        apply_reclaim(s2, reclaimed, now=140.0)
        self.assertEqual(s2.subject_id, "pers-0001")
        self.assertNotEqual(s2.session_id, "sess-cross-1")
        self.assertIsNone(s2.appearance_row_id)
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
        self.assertIsNone(s2.appearance_row_id)
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

    def test_standing_person_does_not_overwrite_card_snapshot(self) -> None:
        """Còn trong khung — upsert last_seen, không ghi đè ảnh thẻ mỗi flush."""
        from unittest.mock import patch

        import numpy as np

        from app.patrol import daystore, db, identity
        from app.patrol.aggregator.engine import ingest_observation, finalize_track

        ts = 5_500.0
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        with patch(
            "app.patrol.aggregator.flush._gate_observation_commit",
            return_value=(True, ts),
        ), patch(
            "app.patrol.aggregator.identity_pipeline._ensure_pers_for_worker",
            return_value="tk-0000002",
        ), patch(
            "app.patrol.aggregator.identity_pipeline._map_worker_to_identity",
            return_value=PersonIdentity(
                person_id="sgc-7003",
                identity_type=IdentityType.ANONYMOUS,
                confidence=0.9,
            ),
        ), patch(
            "app.patrol.sink._write_snapshot",
            return_value="2026-09-03/tk-0000002.jpg",
        ) as write_mock:
            identity.ensure_draft_for_tk("tk-0000002", now=ts)
            for i in range(40):
                ingest_observation(
                    camera_id="HC-01",
                    track_id="ptk-stand-face",
                    now=ts + i * 0.5,
                    lifecycle_tier="person",
                    lifecycle_worker_id="sgc-7003",
                    confidence=0.9,
                    face_eligible=True,
                    face_quality=0.85,
                    frame=frame,
                    person_bbox=(100.0, 80.0, 220.0, 400.0),
                )

        finalize_track("HC-01", "ptk-stand-face", now=ts + 25.0)
        pers_id = identity.resolve_alias("tk-0000002")
        card = db.query_one(
            "SELECT snapshot_path, snapshot_score, last_seen FROM daily_events"
            " WHERE event_date = ? AND pers_id = ?",
            (db.today_vn(ts), pers_id),
        )
        self.assertEqual(card["snapshot_path"], "2026-09-03/tk-0000002.jpg")
        self.assertGreaterEqual(
            float(card["snapshot_score"]),
            daystore.PERSON_LIST_MIN_SNAPSHOT_SCORE,
        )
        self.assertGreater(float(card["last_seen"]), ts)
        # Một lượt, một JPG — không chụp lại sau khi thẻ đã có ảnh mặt.
        self.assertEqual(write_mock.call_count, 1)
        self.assertEqual(len(daystore.list_day_presences(db.today_vn(ts))), 1)

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

        obj_id = "obj-20260830-0099"
        s1 = get_or_create("HC-02", "ptk0001", ts=1000.0)
        s1.subject_id = obj_id
        s1.appearance_row_id = 42
        s1.session_id = "sess-shared"
        s1.committed = True

        s2 = get_or_create("HC-02", "ptk0002", ts=1020.0)
        s2.subject_id = obj_id
        link_subject_session(s2)

        self.assertEqual(s2.appearance_row_id, 42)
        self.assertEqual(s2.session_id, "sess-shared")
        self.assertTrue(s2.committed)

    def test_upsert_separate_rows_for_different_sessions(self) -> None:
        """Hai session khác nhau — mỗi lần đi qua một lượt, không gộp theo GPS/gap."""
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
        self.assertNotEqual(row1, row2)
        rows = daystore.list_day_presences("2026-08-30")
        self.assertEqual(len(rows), 2)
        snap = db.query_one(
            "SELECT snapshot_path FROM appearances WHERE id = ?",
            (row1,),
        )
        self.assertEqual(snap["snapshot_path"], "2026-08-30/tk-0000007-1000.jpg")

    def test_coalesce_merges_same_session_split_track(self) -> None:
        """Cùng session, track id đổi (ByteTrack re-id) — gộp 1 lượt."""
        from app.patrol import daystore, db

        daystore.upsert_track_appearance(
            appearance_id=None,
            event_date="2026-08-30",
            subject_id="tk-0000007",
            camera_id="HC-02",
            zone_id=None,
            track_id="ptk-a",
            session_id="sess-shared",
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
                    "sess-shared",
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

    def test_coalesce_merges_duplicate_session_same_started_at(self) -> None:
        """INSERT đúp cùng session + started_at trong một stream — gộp 1 lượt."""
        from app.patrol import daystore, db

        daystore.upsert_track_appearance(
            appearance_id=None,
            event_date="2026-08-30",
            subject_id="tk-0000001",
            camera_id="HC-02",
            zone_id=None,
            track_id="ptk-a",
            session_id="sess-dup",
            started_at=2000.0,
            ended_at=2010.0,
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
                    "tk-0000001",
                    "HC-02",
                    2000.0,
                    2015.0,
                    20.93,
                    106.92,
                    20.93,
                    106.92,
                    1,
                    2,
                    '["HC-02"]',
                    "snap-b.jpg",
                    "ptk-b",
                    "sess-dup",
                    0,
                    "{}",
                    "[]",
                ),
            )
        merged = daystore.coalesce_subject_appearances(
            "tk-0000001", "2026-08-30", camera_id="HC-02",
        )
        self.assertEqual(merged, 1)
        rows = daystore.list_appearances("tk-0000001", "2026-08-30")["segments"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(int(rows[0]["presence_seq"]), 1)
        self.assertEqual(float(rows[0]["ended_at"]), 2015.0)

    def test_coalesce_skips_same_session_different_track_large_gap(self) -> None:
        """Cùng session nhưng track khác, gap >5s — không gộp (2 pkt / 2 lượt)."""
        from app.patrol import daystore, db

        daystore.upsert_track_appearance(
            appearance_id=None,
            event_date="2026-08-30",
            subject_id="tk-0000009",
            camera_id="HC-02",
            zone_id=None,
            track_id="ptk-a",
            session_id="sess-shared",
            started_at=1000.0,
            ended_at=1010.0,
            gps_lat=20.93,
            gps_lng=106.92,
            payload_json="{}",
            interactions_json="[]",
        )
        with db.tx() as conn:
            conn.execute(
                "INSERT INTO appearances"
                "(event_date, subject_id, camera_id, started_at, ended_at,"
                " gps_lat, gps_lng, gps_lat_end, gps_lng_end, qualified,"
                " presence_seq, source_cameras, track_id, session_id, counted,"
                " event_payload_json, interactions_json)"
                " VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (
                    "2026-08-30",
                    "tk-0000009",
                    "HC-02",
                    1020.0,
                    1030.0,
                    20.93,
                    106.92,
                    20.93,
                    106.92,
                    1,
                    2,
                    '["HC-02"]',
                    "ptk-b",
                    "sess-shared",
                    0,
                    "{}",
                    "[]",
                ),
            )
        merged = daystore.coalesce_subject_appearances(
            "tk-0000009", "2026-08-30", camera_id="HC-02",
        )
        self.assertEqual(merged, 0)
        self.assertEqual(len(daystore.list_day_presences("2026-08-30")), 2)

    def test_coalesce_keeps_separate_sessions(self) -> None:
        """Hai session khác nhau — không gộp dù cùng camera/GPS."""
        from app.patrol import daystore, db

        daystore.upsert_track_appearance(
            appearance_id=None,
            event_date="2026-08-30",
            subject_id="tk-0000008",
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
                    "tk-0000008",
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
            "tk-0000008", "2026-08-30", camera_id="HC-02",
        )
        self.assertEqual(merged, 0)
        rows = daystore.list_day_presences("2026-08-30")
        self.assertEqual(len(rows), 2)

    def test_coalesce_parallel_obj_tracks_same_card(self) -> None:
        """Hai ByteTrack khác track/session — giữ hai dòng lịch sử (không gộp nhầm người)."""
        from app.patrol import daystore, db

        daystore.upsert_track_appearance(
            appearance_id=None,
            event_date="2026-08-30",
            subject_id="obj-20260830-0012",
            camera_id="HC-02",
            zone_id=None,
            track_id="ptk-a",
            session_id="sess-a",
            started_at=1000.0,
            ended_at=1030.0,
            gps_lat=20.93,
            gps_lng=106.92,
            payload_json="{}",
            interactions_json="[]",
            snapshot_path="snap-a.jpg",
        )
        daystore.upsert_track_appearance(
            appearance_id=None,
            event_date="2026-08-30",
            subject_id="obj-20260830-0012",
            camera_id="HC-02",
            zone_id=None,
            track_id="ptk-b",
            session_id="sess-b",
            started_at=1005.0,
            ended_at=1028.0,
            gps_lat=20.93,
            gps_lng=106.92,
            payload_json="{}",
            interactions_json="[]",
            snapshot_path="snap-b.jpg",
        )
        merged = daystore.coalesce_subject_appearances(
            "obj-20260830-0012", "2026-08-30", camera_id="HC-02",
        )
        self.assertEqual(merged, 0)
        rows = daystore.list_day_presences("2026-08-30")
        self.assertEqual(len(rows), 2)


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

    def test_flush_extend_skips_snapshot_when_luot_has_image(self) -> None:
        """Trong khung bám track — không chụp lại JPG khi lượt đã có ảnh."""
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
        session.luot_snapshot_captured = True
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

        write_mock.assert_not_called()
        obj = daystore.list_objects(db.today_vn(ts))[0]
        self.assertEqual(obj["snapshot_path"], "2026-08-30/old.jpg")
        snap = db.query_one(
            "SELECT snapshot_path FROM appearances WHERE id = ?",
            (row_id,),
        )
        self.assertEqual(snap["snapshot_path"], "2026-08-30/old.jpg")

    def test_flush_captures_snapshot_only_once_per_luot(self) -> None:
        """Trong cửa sổ 2s có thể thay JPG; sau đó khóa một ảnh/lượt."""
        import numpy as np
        from unittest.mock import patch

        from app.patrol import db
        from app.patrol.aggregator.flush import flush_session
        from app.patrol.aggregator.session_store import get_or_create
        from app.patrol.aggregator.types import ObservationInput

        ts = 8_000.0
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        bbox = (100.0, 80.0, 220.0, 400.0)
        session = get_or_create("HC-02", "ptk-once", ts=ts)
        session.subject_id = "obj-20260830-0100"
        obs1 = ObservationInput(
            camera_id="HC-02",
            track_id="ptk-once",
            ts=ts,
            person_bbox=bbox,
            frame=frame,
            confidence=0.9,
        )
        with patch(
            "app.patrol.sink._write_snapshot",
            return_value="2026-08-30/first.jpg",
        ) as write_mock:
            flush_session(session, obs1)
        self.assertEqual(write_mock.call_count, 1)
        self.assertFalse(session.luot_snapshot_captured)

        obs2 = ObservationInput(
            camera_id="HC-02",
            track_id="ptk-once",
            ts=ts + 15,
            person_bbox=bbox,
            frame=frame,
            confidence=0.95,
        )
        session.dirty = True
        with patch(
            "app.patrol.sink._write_snapshot",
            return_value="2026-08-30/second.jpg",
        ) as write_mock2:
            flush_session(session, obs2)
        write_mock2.assert_not_called()
        snap = db.query_one(
            "SELECT snapshot_path FROM appearances WHERE id = ?",
            (session.appearance_row_id,),
        )
        self.assertEqual(snap["snapshot_path"], "2026-08-30/first.jpg")


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
            person_bbox=(85.0, 62.0, 225.0, 425.0),
            face_embedding=emb,
            face_quality=0.88,
            face_eligible=True,
            confidence=0.85,
        )
        process_identity(session, obs)
        self.assertTrue(str(session.subject_id).startswith("tk-"))
        self.assertEqual(daystore.list_objects(db.today_vn(ts)), [])

    def test_clutter_object_not_promoted_with_face(self) -> None:
        import numpy as np

        from app.patrol import daystore, db
        from app.patrol.aggregator.identity_pipeline import (
            _human_face_promotion_allowed,
            process_identity,
        )
        from app.patrol.aggregator.session_store import get_or_create, reset as reset_sessions
        from app.patrol.aggregator.types import IdentityType, ObservationInput, PersonIdentity

        reset_sessions()
        ts = 9_000.0
        obj_id = daystore.touch_object(None, camera_id="HC-01", now=ts)
        session = get_or_create("HC-01", "ptk-plant", ts=ts + 5)
        session.subject_id = obj_id
        session.identity = PersonIdentity(identity_type=IdentityType.UNKNOWN)

        plant_box = (100.0, 20.0, 400.0, 180.0)
        emb = tuple(float(x) for x in np.zeros(128, dtype=np.float32))
        obs = ObservationInput(
            camera_id="HC-01",
            track_id="ptk-plant",
            ts=ts + 8,
            person_bbox=plant_box,
            face_embedding=emb,
            face_quality=0.9,
            face_eligible=True,
            confidence=0.9,
        )
        self.assertFalse(_human_face_promotion_allowed(obs))
        process_identity(session, obs)
        self.assertEqual(session.subject_id, obj_id)
        self.assertEqual(len(daystore.list_objects(db.today_vn(ts))), 1)


class BestObservationFinalizeTests(unittest.TestCase):
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

    def test_finalize_uses_best_observation_not_last_frame(self) -> None:
        """Mất track sớm — chốt frame score cao nhất, không frame cuối (có thể mờ)."""
        import numpy as np
        from unittest.mock import patch

        from app.patrol.aggregator.engine import ingest_observation
        from app.patrol.aggregator.engine import finalize_track
        from app.patrol.aggregator.session_store import get_or_create

        ts = 10_000.0
        good_frame = np.zeros((480, 640, 3), dtype=np.uint8)
        bad_frame = np.ones((480, 640, 3), dtype=np.uint8) * 128
        bbox = (100.0, 80.0, 220.0, 400.0)

        with patch(
            "app.patrol.sink._write_snapshot",
            side_effect=lambda *a, **k: f"2026-08-30/score-{k.get('score', 0):.2f}.jpg",
        ):
            ingest_observation(
                camera_id="HC-02",
                track_id="ptk-best",
                now=ts,
                person_bbox=bbox,
                frame=good_frame,
                confidence=0.9,
                face_quality=0.0,
            )
            ingest_observation(
                camera_id="HC-02",
                track_id="ptk-best",
                now=ts + 0.4,
                person_bbox=bbox,
                frame=bad_frame,
                confidence=0.2,
                face_quality=0.0,
            )
            session = get_or_create("HC-02", "ptk-best", ts=ts + 0.4)
            self.assertIsNotNone(session.best_observation)
            self.assertAlmostEqual(session.best_observation_score, 0.9, places=2)
            finalize_track("HC-02", "ptk-best", now=ts + 0.5)

        from app.patrol import daystore, db

        objs = daystore.list_objects(db.today_vn(ts))
        self.assertEqual(len(objs), 1)
        snap = objs[0]["snapshot_path"] or ""
        self.assertIn("score-0.90", snap)
        self.assertNotIn("score-0.20", snap)

    def test_fast_passing_object_commits_before_accumulation_window(self) -> None:
        """Xe/người chạy qua — ghi thẻ trước 2s (min-commit), không chờ cửa sổ frame đẹp."""
        import numpy as np
        from unittest.mock import patch

        from app.patrol.aggregator.engine import finalize_track, ingest_observation
        from app.patrol.sink import track_accumulation_window_seconds

        ts = 20_000.0
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        bbox = (400.0, 280.0, 520.0, 520.0)
        window = track_accumulation_window_seconds()

        with patch(
            "app.patrol.aggregator.flush._write_snapshot",
            return_value=("2026-08-30/pass.jpg", 0.88),
        ):
            oid = ingest_observation(
                camera_id="DR-03",
                track_id="ptk-pass",
                now=ts,
                person_bbox=bbox,
                frame=frame,
                confidence=0.88,
            )
            self.assertIsNone(oid)
            oid = ingest_observation(
                camera_id="DR-03",
                track_id="ptk-pass",
                now=ts + 0.36,
                person_bbox=bbox,
                frame=frame,
                confidence=0.88,
            )
            self.assertTrue(str(oid or "").startswith("obj-"))
            finalize_track("DR-03", "ptk-pass", now=ts + 0.9)

        from app.patrol import daystore, db

        objs = daystore.list_objects(db.today_vn(ts))
        self.assertEqual(len(objs), 1)
        self.assertLess(ts + 0.36 - ts, window)


class PromotedCardSnapshotRepairTests(unittest.TestCase):
    """Thăng hạng sau cửa sổ tích lũy — thẻ Người phải bỏ được ảnh Đối tượng."""

    def setUp(self) -> None:
        from app.patrol import db, sink

        self._tmp = tempfile.TemporaryDirectory()
        db.close()
        db.DATA_DIR = Path(self._tmp.name)
        db.DB_FILE = Path(self._tmp.name) / "patrol.db"
        sink.SNAPSHOT_DIR = db.DATA_DIR / "patrol_snapshots"
        db.get_conn()
        sink.reset()
        reset()

    def tearDown(self) -> None:
        from app.patrol import db

        reset()
        db.close()
        self._tmp.cleanup()

    def _promoted_person_session(self, ts: float):
        """obj thăng lên tk-* mang theo JPG không mặt (score < 1.05), lượt đã khoá."""
        from app.patrol import daystore, identity
        from app.patrol.aggregator.session_store import get_or_create

        obj_id = daystore.touch_object(
            None,
            camera_id="HC-01",
            snapshot_path="2026-09-03/obj-back.jpg",
            snapshot_score=0.817,
            now=ts,
            skip_appearance=True,
        )
        pers_id = identity.ensure_draft_for_tk("tk-0000001", now=ts)
        daystore.promote_object(obj_id, pers_id, now=ts + 3)

        session = get_or_create("HC-01", "ptk-promote", ts=ts)
        session.subject_id = pers_id
        session.started_at = ts
        session.last_seen_at = ts + 30
        session.committed = True
        session.luot_snapshot_captured = True
        session.last_flush_at = ts + 3
        session.dirty = True
        return pers_id, session

    def _card(self, ts: float, pers_id: str):
        from app.patrol import db

        return db.query_one(
            "SELECT snapshot_path, snapshot_score FROM daily_events"
            " WHERE event_date = ? AND pers_id = ?",
            (db.today_vn(ts), pers_id),
        )

    def test_person_card_keeps_object_photo_before_fix_is_repaired(self) -> None:
        import numpy as np
        from unittest.mock import patch

        from app.patrol import daystore
        from app.patrol.aggregator.flush import flush_session
        from app.patrol.aggregator.types import ObservationInput

        ts = 30_000.0
        pers_id, session = self._promoted_person_session(ts)

        stale = self._card(ts, pers_id)
        self.assertEqual(stale["snapshot_path"], "2026-09-03/obj-back.jpg")
        self.assertLess(
            float(stale["snapshot_score"]),
            daystore.PERSON_LIST_MIN_SNAPSHOT_SCORE,
        )

        # Người ngoảnh mặt lại ở giây thứ 30 — ngoài cửa sổ tích lũy 2s.
        face_obs = ObservationInput(
            camera_id="HC-01",
            track_id="ptk-promote",
            ts=ts + 30,
            person_bbox=(85.0, 62.0, 225.0, 425.0),
            frame=np.zeros((480, 640, 3), dtype=np.uint8),
            face_quality=0.9,
            face_eligible=True,
            confidence=0.9,
        )
        with patch(
            "app.patrol.sink._write_snapshot",
            return_value="2026-09-03/tk-0000001.jpg",
        ) as write_mock:
            flush_session(session, face_obs)

        write_mock.assert_called()
        card = self._card(ts, pers_id)
        self.assertEqual(card["snapshot_path"], "2026-09-03/tk-0000001.jpg")
        self.assertGreaterEqual(
            float(card["snapshot_score"]),
            daystore.PERSON_LIST_MIN_SNAPSHOT_SCORE,
        )

    def test_repaired_card_counts_as_person_in_day_stats(self) -> None:
        import numpy as np
        from unittest.mock import patch

        from app.patrol import daystore, db
        from app.patrol.aggregator.flush import flush_session
        from app.patrol.aggregator.types import ObservationInput

        ts = 31_000.0
        _pers_id, session = self._promoted_person_session(ts)
        self.assertEqual(daystore.day_stats(db.today_vn(ts))["person_count"], 0)

        face_obs = ObservationInput(
            camera_id="HC-01",
            track_id="ptk-promote",
            ts=ts + 30,
            person_bbox=(85.0, 62.0, 225.0, 425.0),
            frame=np.zeros((480, 640, 3), dtype=np.uint8),
            face_quality=0.9,
            face_eligible=True,
            confidence=0.9,
        )
        with patch(
            "app.patrol.sink._write_snapshot",
            return_value="2026-09-03/tk-0000001.jpg",
        ):
            flush_session(session, face_obs)

        self.assertEqual(daystore.day_stats(db.today_vn(ts))["person_count"], 1)

    def test_locked_luot_still_skips_snapshot_without_face(self) -> None:
        """Không có mặt thì vẫn giữ một JPG mỗi lượt — không mở lại cổng chụp."""
        import numpy as np
        from unittest.mock import patch

        from app.patrol.aggregator.flush import flush_session
        from app.patrol.aggregator.types import ObservationInput

        ts = 32_000.0
        pers_id, session = self._promoted_person_session(ts)

        back_obs = ObservationInput(
            camera_id="HC-01",
            track_id="ptk-promote",
            ts=ts + 30,
            person_bbox=(85.0, 62.0, 225.0, 425.0),
            frame=np.zeros((480, 640, 3), dtype=np.uint8),
            face_eligible=False,
            confidence=0.95,
        )
        with patch(
            "app.patrol.sink._write_snapshot",
            return_value="2026-09-03/should-not-write.jpg",
        ) as write_mock:
            flush_session(session, back_obs)

        write_mock.assert_not_called()
        card = self._card(ts, pers_id)
        self.assertEqual(card["snapshot_path"], "2026-09-03/obj-back.jpg")


if __name__ == "__main__":
    unittest.main()
