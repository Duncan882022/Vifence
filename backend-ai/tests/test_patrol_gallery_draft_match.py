"""Gallery draft match — obj/tk không trùng khi cùng góc mặt TK đã enroll."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

from app.patrol import db, identity
from app.patrol.aggregator.identity_pipeline import try_promote_object_after_snapshot
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


def _nudge(base: list[float], scale: float) -> list[float]:
    arr = np.asarray(base, dtype=np.float32) * scale
    arr /= max(float(np.linalg.norm(arr)), 1e-6)
    return arr.tolist()


if __name__ == "__main__":
    unittest.main()
