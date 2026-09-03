"""Gallery draft match — obj/tk không trùng khi cùng góc mặt TK đã enroll."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

from app.patrol import db, daystore, identity
from app.patrol.aggregator.flush import flush_session
from app.patrol.aggregator.identity_pipeline import (
    resolve_subject_from_face_match,
    try_promote_object_after_snapshot,
)
from app.patrol.aggregator.types import ObservationInput, TrackSession


def _vec(seed: float) -> list[float]:
    rng = np.random.default_rng(int(seed * 1000) % 2**31)
    v = rng.standard_normal(128).astype(np.float32)
    v /= max(float(np.linalg.norm(v)), 1e-6)
    return v.tolist()


class GalleryDraftMatchTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        db.close()
        db.DATA_DIR = Path(self._tmp.name)
        db.DB_FILE = Path(self._tmp.name) / "patrol.db"
        db.get_conn()
        identity.ensure_draft_for_tk("tk-0000001", now=1_000.0)
        identity.add_face(
            "tk-0000001",
            _vec(1.0),
            quality=0.9,
            camera_id="HC-01",
        )

    def tearDown(self) -> None:
        self._tmp.cleanup()

    def test_observe_face_matches_existing_draft_tk_via_sqlite(self) -> None:
        emb = _nudge(_vec(1.0), 0.85)
        pid, created = identity.observe_face(emb, quality=0.88, camera_id="HC-01", now=2_000.0)
        self.assertFalse(created)
        self.assertEqual(pid, "tk-0000001")

    def test_pers_id_for_gallery_worker_resolves_draft_tk_direct(self) -> None:
        resolved = identity.pers_id_for_gallery_worker("tk-0000001")
        self.assertIsNotNone(resolved)
        assert resolved is not None
        self.assertEqual(resolved[0], "tk-0000001")

    def test_pers_id_for_gallery_worker_resolves_draft_tk_alias(self) -> None:
        bindings = {
            "version": 1,
            "by_gallery_worker": {
                "p-NV001": {
                    "gallery_worker_id": "p-NV001",
                    "worker_name": "Nguyễn Văn A",
                    "employee_code": "NV001",
                    "aliases": ["p-NV001", "tk-0000001"],
                },
            },
            "alias_to_gallery": {"p-NV001": "p-NV001", "tk-0000001": "p-NV001"},
        }
        with patch("app.patrol_identity_store._load", return_value=bindings):
            resolved = identity.pers_id_for_gallery_worker("p-NV001")
        self.assertIsNotNone(resolved)
        assert resolved is not None
        self.assertEqual(resolved[0], "tk-0000001")

    def test_snapshot_repair_promotes_obj_to_existing_tk_not_new(self) -> None:
        emb = _nudge(_vec(1.0), 0.85)
        session = TrackSession(
            camera_id="DR-03",
            track_id="ptk-a",
            zone_id=None,
            started_at=1_000.0,
            last_seen_at=1_010.0,
        )
        session.subject_id = "obj-20260903-0001"
        obs = ObservationInput(
            camera_id="DR-03",
            track_id="ptk-a",
            ts=1_010.0,
            face_eligible=True,
            face_embedding=emb,
            face_quality=0.9,
            confidence=0.88,
            person_bbox=(100.0, 80.0, 220.0, 400.0),
        )
        try_promote_object_after_snapshot(
            session,
            obs,
            snapshot_path="2026-09-03/obj.jpg",
            snapshot_score=1.2,
        )
        self.assertEqual(session.subject_id, "tk-0000001")

    def test_resolve_subject_from_face_match_returns_existing_tk(self) -> None:
        emb = _nudge(_vec(1.0), 0.85)
        session = TrackSession(
            camera_id="DR-03",
            track_id="ptk-match",
            zone_id=None,
            started_at=1_000.0,
            last_seen_at=1_010.0,
        )
        obs = ObservationInput(
            camera_id="DR-03",
            track_id="ptk-match",
            ts=1_010.0,
            face_eligible=True,
            face_embedding=emb,
            face_quality=0.9,
            confidence=0.88,
            person_bbox=(100.0, 80.0, 220.0, 400.0),
        )
        pers = resolve_subject_from_face_match(session, obs, now=1_010.0)
        self.assertEqual(pers, "tk-0000001")
        self.assertEqual(session.subject_id, "tk-0000001")

    def test_flush_skips_obj_when_face_matches_draft_tk(self) -> None:
        emb = _nudge(_vec(1.0), 0.85)
        session = TrackSession(
            camera_id="DR-03",
            track_id="ptk-flush",
            zone_id=None,
            started_at=1_000.0,
            last_seen_at=1_010.0,
        )
        obs = ObservationInput(
            camera_id="DR-03",
            track_id="ptk-flush",
            ts=1_010.0,
            face_eligible=True,
            face_embedding=emb,
            face_quality=0.9,
            confidence=0.88,
            person_bbox=(100.0, 80.0, 220.0, 400.0),
        )
        with patch(
            "app.patrol.aggregator.flush._gate_observation_commit",
            return_value=(True, 1_010.0),
        ), patch(
            "app.patrol.aggregator.flush._write_snapshot",
            return_value=(None, 0.0),
        ):
            flush_session(session, obs)
        self.assertEqual(session.subject_id, "tk-0000001")
        objs = daystore.list_objects(db.today_vn(1_010.0))
        self.assertEqual(len(objs), 0)
        persons = daystore.list_person_events(db.today_vn(1_010.0))
        self.assertEqual(len(persons), 1)
        self.assertEqual(persons[0].get("pers_id"), "tk-0000001")

    def test_cross_camera_tk_bind_upserts_card_without_face(self) -> None:
        """tk đã gặp HC-01 — xuất hiện HC-02 (ROI tk, chưa mặt) vẫn upsert thẻ Người."""
        from unittest.mock import patch

        from app.patrol.aggregator.identity_pipeline import resolve_subject_from_known_tk

        daystore.touch_person_event(
            "tk-0000001",
            camera_id="HC-01",
            snapshot_path="2026-09-03/tk-0000001.jpg",
            snapshot_score=1.2,
            face_eligible=True,
            now=1_000.0,
        )
        session = TrackSession(
            camera_id="HC-02",
            track_id="ptk-hc02",
            zone_id=None,
            started_at=2_000.0,
            last_seen_at=2_010.0,
        )
        obs = ObservationInput(
            camera_id="HC-02",
            track_id="ptk-hc02",
            ts=2_010.0,
            face_eligible=False,
            confidence=0.9,
            lifecycle_tier="person",
            lifecycle_worker_id="sgc-0000001",
            person_bbox=(100.0, 80.0, 220.0, 400.0),
        )
        pers = resolve_subject_from_known_tk(session, obs, now=2_010.0)
        self.assertEqual(pers, "tk-0000001")
        with patch(
            "app.patrol.aggregator.flush._gate_observation_commit",
            return_value=(True, 2_010.0),
        ), patch(
            "app.patrol.aggregator.flush._write_snapshot",
            return_value=(None, 0.0),
        ):
            flush_session(session, obs)
        cards = daystore.list_person_events(db.today_vn(2_000.0))
        self.assertEqual(len(cards), 1)
        self.assertEqual(cards[0]["pers_id"], "tk-0000001")
        self.assertEqual(cards[0]["last_seen"], 2_010.0)
        objs = daystore.list_objects(db.today_vn(2_000.0))
        self.assertEqual(len(objs), 0)
        hist = daystore.list_appearances("tk-0000001", db.today_vn(2_000.0))
        self.assertIn("HC-01", hist["by_camera"])
        self.assertIn("HC-02", hist["by_camera"])
        self.assertEqual(len(hist["segments"]), 2)

    def test_cross_camera_reclaim_inserts_second_appearance_via_flush(self) -> None:
        """HC-01 chốt → HC-02 trong 45s: upsert thẻ, hai dòng lịch sử (không ghi đè)."""
        from unittest.mock import patch

        import numpy as np

        from app.patrol.aggregator.engine import finalize_track, ingest_observation
        from app.patrol.aggregator.lost_track_memory import reset as reset_lost
        from app.patrol.aggregator.session_store import reset as reset_sessions

        reset_sessions()
        reset_lost()
        identity.ensure_draft_for_tk("tk-0000001", now=1_000.0)
        emb = tuple(0.015 * i for i in range(512))
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        ts = 5_000.0

        with patch(
            "app.patrol.aggregator.flush._gate_observation_commit",
            return_value=(True, ts),
        ), patch(
            "app.patrol.sink._write_snapshot",
            return_value="2026-09-03/tk-0000001.jpg",
        ):
            for i in range(6):
                ingest_observation(
                    camera_id="HC-01",
                    track_id="ptk-hc01",
                    now=ts + i * 0.5,
                    lifecycle_tier="person",
                    lifecycle_worker_id="sgc-0000001",
                    confidence=0.9,
                    face_eligible=True,
                    face_quality=0.85,
                    face_embedding=emb,
                    frame=frame,
                    person_bbox=(100.0, 80.0, 220.0, 400.0),
                )
            finalize_track("HC-01", "ptk-hc01", now=ts + 8.0)

            for i in range(6):
                ingest_observation(
                    camera_id="HC-02",
                    track_id="ptk-hc02",
                    now=ts + 20.0 + i * 0.5,
                    lifecycle_tier="person",
                    lifecycle_worker_id="sgc-0000001",
                    confidence=0.9,
                    face_eligible=True,
                    face_quality=0.85,
                    face_embedding=emb,
                    frame=frame,
                    person_bbox=(100.0, 80.0, 220.0, 400.0),
                )
            finalize_track("HC-02", "ptk-hc02", now=ts + 30.0)

        cards = daystore.list_person_events(db.today_vn(ts))
        self.assertEqual(len(cards), 1)
        self.assertEqual(cards[0]["pers_id"], "tk-0000001")
        hist = daystore.list_appearances("tk-0000001", db.today_vn(ts))
        self.assertEqual(len(hist["segments"]), 2)
        self.assertIn("HC-01", hist["by_camera"])
        self.assertIn("HC-02", hist["by_camera"])
        reset_sessions()
        reset_lost()


def _nudge(base: list[float], scale: float) -> list[float]:
    arr = np.asarray(base, dtype=np.float32) * scale
    arr /= max(float(np.linalg.norm(arr)), 1e-6)
    return arr.tolist()


if __name__ == "__main__":
    unittest.main()
