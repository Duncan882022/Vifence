"""Siết re-ID tk — một người không được hai thẻ trong cùng ngày."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.patrol import db, daystore, identity  # noqa: E402
from app.person_identity_registry import (  # noqa: E402
    clear_registry,
    resolve_patrol_person_identity,
)
from app.schemas import PpeDetection  # noqa: E402


def _vec(seed: float) -> list[float]:
    rng = np.random.default_rng(int(seed * 1000) % 2**31)
    v = rng.standard_normal(128).astype(np.float32)
    v /= max(float(np.linalg.norm(v)), 1e-6)
    return v.tolist()


def _nudge(base: list[float], scale: float) -> list[float]:
    arr = np.asarray(base, dtype=np.float32) * scale
    arr /= max(float(np.linalg.norm(arr)), 1e-6)
    return arr.tolist()


class PatrolTkDedupTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        db.close()
        db.DATA_DIR = Path(self._tmp.name)
        db.DB_FILE = Path(self._tmp.name) / "patrol.db"
        db.get_conn()

        self._reg_dir = tempfile.TemporaryDirectory()
        self._reg_file = Path(self._reg_dir.name) / "person_identity_registry.json"
        self._reg_file.write_text(
            json.dumps({"next_seq": 1, "tracks": {}, "track_meta": {}}),
            encoding="utf-8",
        )
        self._patches = [
            patch("app.person_identity_registry.REGISTRY_FILE", self._reg_file),
            patch("app.person_identity_registry._state", None),
        ]
        for p in self._patches:
            p.start()
        clear_registry()

    def tearDown(self) -> None:
        for p in reversed(self._patches):
            p.stop()
        self._reg_dir.cleanup()
        self._tmp.cleanup()

    def test_find_duplicate_tk_today_matches_existing_card(self) -> None:
        emb = _vec(7.0)
        identity.ensure_draft_for_tk("tk-0000001", now=1_000.0)
        identity.add_face("tk-0000001", emb, quality=0.9, camera_id="HC-01")
        daystore.touch_person_event(
            "tk-0000001",
            camera_id="HC-01",
            snapshot_path="2026-09-05/tk.jpg",
            snapshot_score=1.2,
            face_eligible=True,
            now=1_000.0,
        )

        dup, sim = identity.find_duplicate_tk_today(
            _nudge(emb, 0.82),
            exclude_tk="tk-0000002",
            now=1_100.0,
        )
        self.assertEqual(dup, "tk-0000001")
        self.assertGreater(sim, identity.MATCH_MIN_SIMILARITY)

    def test_observe_face_merges_preferred_tk_into_existing(self) -> None:
        emb = _vec(8.0)
        identity.ensure_draft_for_tk("tk-0000001", now=1_000.0)
        identity.add_face("tk-0000001", emb, quality=0.9, camera_id="HC-01")
        daystore.touch_person_event(
            "tk-0000001",
            camera_id="HC-01",
            snapshot_path="2026-09-05/tk1.jpg",
            snapshot_score=1.2,
            face_eligible=True,
            now=1_000.0,
        )
        identity.ensure_draft_for_tk("tk-0000002", now=1_050.0)
        daystore.touch_person_event(
            "tk-0000002",
            camera_id="HC-02",
            snapshot_path="2026-09-05/tk2.jpg",
            snapshot_score=1.2,
            face_eligible=True,
            now=1_050.0,
        )

        pid, created = identity.observe_face(
            _nudge(emb, 0.84),
            quality=0.88,
            camera_id="HC-02",
            preferred_tk="tk-0000002",
            now=1_100.0,
        )
        self.assertFalse(created)
        self.assertEqual(pid, "tk-0000001")
        cards = daystore.list_person_events(db.today_vn(1_100.0))
        self.assertEqual(len(cards), 1)
        self.assertEqual(cards[0]["pers_id"], "tk-0000001")

    def test_registry_reuses_tk_not_new_code(self) -> None:
        emb = _vec(11.0)
        identity.ensure_draft_for_tk("tk-0000001", now=1_000.0)
        identity.add_face("tk-0000001", emb, quality=0.9, camera_id="HC-01")
        daystore.touch_person_event(
            "tk-0000001",
            camera_id="HC-01",
            snapshot_path="2026-09-05/tk.jpg",
            snapshot_score=1.2,
            face_eligible=True,
            now=1_000.0,
        )

        det = PpeDetection(
            behavior="person",
            label="person",
            scenario_id="PERS-001",
            confidence=0.92,
            bbox=[400.0, 10.0, 500.0, 200.0],
            worker_id="unknown",
            worker_name="",
            face_match_confidence=0.0,
            face_match_source="person_ineligible",
        )
        wid, _ = resolve_patrol_person_identity(
            det,
            "HC-02",
            "p02:person",
            person_bbox=[400.0, 10.0, 500.0, 200.0],
            face_emb=_nudge(emb, 0.83),
        )
        self.assertEqual(wid, "tk-0000001")


if __name__ == "__main__":
    unittest.main()
