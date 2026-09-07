"""Lifecycle commit matrix — person sớm, object lúc finalize, không mid-track obj."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

from app.patrol import daystore, db, identity, sink

_PERSON_BOX = [85.0, 62.0, 225.0, 425.0]
_MIN_TRACK = 0.75


def _vec(seed: int, dim: int = 128) -> list[float]:
    rng = np.random.default_rng(seed)
    v = rng.normal(size=dim).astype(np.float32)
    return (v / np.linalg.norm(v)).tolist()


class PatrolLifecycleCommitTests(unittest.TestCase):
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

    def test_a1_gallery_identified_commits_before_finalize(self) -> None:
        """A1: gallery match → thẻ Định danh sớm, không tạo obj-*."""
        identity.import_identity(
            full_name="Duncan",
            employee_code="DUNCAN",
            contractor="SGC",
            source="hr_import",
        )
        bindings = {
            "version": 1,
            "by_gallery_worker": {
                "p-DUNCAN": {
                    "gallery_worker_id": "p-DUNCAN",
                    "worker_name": "Duncan",
                    "employee_code": "DUNCAN",
                    "contractor_name": "SGC",
                    "aliases": ["p-DUNCAN"],
                },
            },
            "alias_to_gallery": {"p-DUNCAN": "p-DUNCAN"},
        }
        t0 = 1_000.0
        with patch("app.patrol_identity_store._load", return_value=bindings):
            pers = sink.record_observation(
                camera_id="HC-01",
                track_id="ptk-a1:person",
                person_bbox=_PERSON_BOX,
                face_embedding=_vec(1),
                face_quality=0.9,
                face_eligible=True,
                now=t0,
                lifecycle_tier="identity",
                lifecycle_worker_id="p-DUNCAN",
            )
        self.assertEqual(str(pers), "p-DUNCAN")
        self.assertEqual(daystore.list_objects(db.today_vn(t0)), [])
        self.assertEqual(len(daystore.list_person_events(db.today_vn(t0))), 1)

        sink.forget_track("HC-01", "ptk-a1:person", now=t0 + 2.0)
        self.assertEqual(daystore.list_objects(db.today_vn(t0)), [])

    def test_a2_new_tk_from_face_no_mid_object(self) -> None:
        """A2: mặt đủ → tk-* mới, abandon face pipeline, không obj mid-track."""
        t0 = 2_000.0
        pers = sink.record_observation(
            camera_id="HC-01",
            track_id="ptk-a2:person",
            person_bbox=_PERSON_BOX,
            face_embedding=_vec(2),
            face_quality=0.85,
            face_eligible=True,
            now=t0,
        )
        self.assertTrue(str(pers or "").startswith("tk-"))
        self.assertEqual(daystore.list_objects(db.today_vn(t0)), [])

        from app.patrol.aggregator.session_store import get_session

        session = get_session("HC-01", "ptk-a2:person")
        self.assertIsNotNone(session)
        assert session is not None
        self.assertTrue(session.person_committed)
        self.assertTrue(session.face_checks_disabled)

    def test_a4_object_only_on_finalize(self) -> None:
        """A4: không mặt → không thẻ cho đến finalize."""
        t0 = 3_000.0
        sink.record_observation(
            camera_id="HC-01",
            track_id="ptk-a4:person",
            person_bbox=_PERSON_BOX,
            now=t0,
        )
        sink.record_observation(
            camera_id="HC-01",
            track_id="ptk-a4:person",
            person_bbox=_PERSON_BOX,
            now=t0 + _MIN_TRACK,
        )
        self.assertEqual(daystore.list_objects(db.today_vn(t0)), [])

        sink.forget_track("HC-01", "ptk-a4:person", now=t0 + 1.0)
        objs = daystore.list_objects(db.today_vn(t0))
        self.assertEqual(len(objs), 1)
        self.assertTrue(str(objs[0]["obj_id"]).startswith("obj-"))

    def test_a7_fast_path_high_quality_short_track(self) -> None:
        """A7: track ngắn + quality cao → commit person trước min track."""
        from app.config import settings

        t0 = 4_000.0
        fast_q = float(getattr(settings, "patrol_person_commit_fast_quality", 0.75)) + 0.05
        pers = sink.record_observation(
            camera_id="HC-01",
            track_id="ptk-a7:person",
            person_bbox=_PERSON_BOX,
            face_embedding=_vec(7),
            face_quality=fast_q,
            face_eligible=True,
            now=t0,
        )
        self.assertTrue(str(pers or "").startswith("tk-"))
        self.assertEqual(daystore.list_objects(db.today_vn(t0)), [])

    def test_reencounter_upserts_same_card(self) -> None:
        """Gặp lại (track mới) → upsert cùng thẻ tk-*, không obj trung gian."""
        t0 = 5_000.0
        emb = _vec(9)
        first = sink.record_observation(
            camera_id="HC-01",
            track_id="ptk-r1:person",
            person_bbox=_PERSON_BOX,
            face_embedding=emb,
            face_quality=0.88,
            face_eligible=True,
            now=t0,
        )
        sink.forget_track("HC-01", "ptk-r1:person", now=t0 + 2.0)

        second = sink.record_observation(
            camera_id="HC-01",
            track_id="ptk-r2:person",
            person_bbox=_PERSON_BOX,
            face_embedding=emb,
            face_quality=0.88,
            face_eligible=True,
            now=t0 + 30.0,
        )
        self.assertEqual(first, second)
        self.assertEqual(len(daystore.list_person_events(db.today_vn(t0))), 1)
        self.assertEqual(daystore.list_objects(db.today_vn(t0)), [])


    def test_lifecycle_tk_without_face_records_event_on_finalize(self) -> None:
        """Live tier Người (tk-*) nhưng chưa đủ mặt commit — vẫn ghi thẻ khi rời khung."""
        t0 = 6_500.0
        sink.record_observation(
            camera_id="HC-01",
            track_id="ptk-lifecycle-tk",
            person_bbox=_PERSON_BOX,
            now=t0,
            lifecycle_tier="person",
            lifecycle_worker_id="tk-0000001",
        )
        sink.record_observation(
            camera_id="HC-01",
            track_id="ptk-lifecycle-tk",
            person_bbox=_PERSON_BOX,
            now=t0 + _MIN_TRACK,
            lifecycle_tier="person",
            lifecycle_worker_id="tk-0000001",
        )
        self.assertEqual(daystore.list_objects(db.today_vn(t0)), [])

        sink.forget_track("HC-01", "ptk-lifecycle-tk", now=t0 + 2.0)
        cards = daystore.list_person_events(db.today_vn(t0))
        self.assertEqual(len(cards), 1)
        self.assertEqual(cards[0]["pers_id"], "tk-0000001")
        self.assertEqual(daystore.list_objects(db.today_vn(t0)), [])


if __name__ == "__main__":
    unittest.main()
