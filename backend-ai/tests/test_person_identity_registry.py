"""person_identity_registry — tránh gộp 2 người khác mặt thành 1 ID trong cùng frame."""

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

from app.person_identity_registry import (  # noqa: E402
    _conflicts_frame_faces,
    clear_registry,
    resolve_patrol_person_identity,
)
from app.schemas import PpeDetection  # noqa: E402


def _test_face_emb(seed: int) -> list[float]:
    """Vector one-hot theo đúng chiều của model mặt đang chạy (SFace 128-D)."""
    from app.person_identity_registry import _expected_emb_dim

    dim = _expected_emb_dim()
    vec = np.zeros(dim, dtype=np.float64)
    vec[int(seed) % dim] = 1.0
    return vec.tolist()


class ClearRegistryTests(unittest.TestCase):
    """Reset không được cấp lại ID cũ — alias thủ công cũ sẽ dán nhầm người mới."""

    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self._reg_file = Path(self._tmpdir.name) / "person_identity_registry.json"
        self._reg_file.write_text(
            json.dumps(
                {"next_seq": 42, "tracks": {"HC-02|t1": "sgc-00000041"}, "track_meta": {}},
            ),
            encoding="utf-8",
        )
        self._patches = [
            patch("app.person_identity_registry.REGISTRY_FILE", self._reg_file),
            patch("app.person_identity_registry._state", None),
        ]
        for p in self._patches:
            p.start()

    def tearDown(self) -> None:
        for p in reversed(self._patches):
            p.stop()
        self._tmpdir.cleanup()

    def test_clear_preserves_next_seq(self) -> None:
        clear_registry()
        state = json.loads(self._reg_file.read_text(encoding="utf-8"))
        self.assertEqual(state["tracks"], {})
        self.assertEqual(state["next_seq"], 42)

    def test_restart_drops_track_map_but_keeps_next_seq(self) -> None:
        """Track id đánh lại từ p01 sau restart — giữ map cũ là dán nhầm người."""
        from app.person_identity_registry import _load, peek_patrol_track_identity

        self.assertEqual(_load()["tracks"], {})
        self.assertEqual(_load()["next_seq"], 42)
        self.assertEqual(peek_patrol_track_identity("HC-02", "t1"), "")


class PersonIdentityRegistryFrameSplitTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self._reg_file = Path(self._tmpdir.name) / "person_identity_registry.json"
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

    def tearDown(self) -> None:
        for p in reversed(self._patches):
            p.stop()
        self._tmpdir.cleanup()

    def test_conflicts_when_same_worker_two_incompatible_faces(self) -> None:
        emb_a = np.asarray(_test_face_emb(1))
        emb_b = np.asarray(_test_face_emb(9))
        frame = {"w-trung": _test_face_emb(1)}
        self.assertTrue(_conflicts_frame_faces("w-trung", emb_b, frame))
        self.assertFalse(_conflicts_frame_faces("w-trung", emb_a, frame))

    def test_gallery_verified_second_person_gets_new_tk(self) -> None:
        emb_a = _test_face_emb(1)
        emb_b = _test_face_emb(9)
        gallery_id = "w-trung"

        det_trung = PpeDetection(
            behavior="person",
            label="person",
            scenario_id="PERS-001",
            confidence=0.92,
            bbox=[10.0, 10.0, 100.0, 200.0],
            worker_id=gallery_id,
            worker_name="Trung",
            face_match_confidence=0.91,
            face_match_source="face",
        )
        det_other = PpeDetection(
            behavior="person",
            label="person",
            scenario_id="PERS-001",
            confidence=0.92,
            bbox=[400.0, 10.0, 500.0, 200.0],
            worker_id=gallery_id,
            worker_name="Trung",
            face_match_confidence=0.91,
            face_match_source="face",
        )

        with patch("app.worker_identity.verify.is_verified_face_match", return_value=True):
            w1, n1 = resolve_patrol_person_identity(
                det_trung,
                "HC-02",
                "p01:person",
                person_bbox=[10.0, 10.0, 100.0, 200.0],
                face_emb=emb_a,
            )
            frame_faces = {w1: emb_a}
            w2, n2 = resolve_patrol_person_identity(
                det_other,
                "HC-02",
                "p02:person",
                person_bbox=[400.0, 10.0, 500.0, 200.0],
                face_emb=emb_b,
                frame_face_assignments=frame_faces,
            )

        self.assertEqual(w1, gallery_id)
        self.assertEqual(n1, "Trung")
        self.assertNotEqual(w2, gallery_id)
        self.assertTrue(str(w2).startswith("tk-0"))

    def test_two_gallery_workers_same_frame_stay_distinct(self) -> None:
        emb_a = _test_face_emb(1)
        emb_b = _test_face_emb(9)

        def _resolve(worker_id: str, name: str, track: str, bbox: list[float], emb: list[float], frame: dict | None):
            det = PpeDetection(
                behavior="person",
                label="person",
                scenario_id="PERS-001",
                confidence=0.92,
                bbox=bbox,
                worker_id=worker_id,
                worker_name=name,
                face_match_confidence=0.91,
                face_match_source="face",
            )
            with patch("app.worker_identity.verify.is_verified_face_match", return_value=True):
                return resolve_patrol_person_identity(
                    det,
                    "HC-02",
                    track,
                    person_bbox=bbox,
                    face_emb=emb,
                    frame_face_assignments=frame,
                )

        w_trung, _ = _resolve(
            "w-trung", "Trung", "p01:person",
            [10.0, 10.0, 100.0, 200.0], emb_a, None,
        )
        frame = {w_trung: emb_a}
        w_son, _ = _resolve(
            "w-son", "Sơn", "p02:person",
            [400.0, 10.0, 500.0, 200.0], emb_b, frame,
        )

        self.assertEqual(w_trung, "w-trung")
        self.assertEqual(w_son, "w-son")
        self.assertNotEqual(w_trung, w_son)

    def test_gallery_embedding_match_promotes_to_bound_identity(self) -> None:
        emb = _test_face_emb(3)
        det = PpeDetection(
            behavior="person",
            label="person",
            scenario_id="PERS-001",
            confidence=0.88,
            bbox=[100.0, 80.0, 900.0, 700.0],
            worker_id="unknown",
            worker_name="",
            face_match_confidence=0.0,
            face_match_source="person_ineligible",
        )
        gallery_id = "p-OBJ-20260824-7D8FAE"
        with patch(
            "app.person_identity_registry._match_patrol_gallery_from_embedding",
            return_value=(gallery_id, "Duncan", 0.91),
        ):
            with patch(
                "app.patrol.identity.hr_profile_for_gallery",
                return_value={"full_name": "Duncan", "status": "identified"},
            ):
                wid, name = resolve_patrol_person_identity(
                    det,
                    "HC-01",
                    "p43:person:03",
                    person_bbox=[100.0, 80.0, 900.0, 700.0],
                    face_emb=emb,
                )
        self.assertEqual(wid, gallery_id)
        self.assertEqual(name, "Duncan")
        self.assertEqual(det.worker_id, gallery_id)
        self.assertEqual(det.face_match_source, "face")
        self.assertGreaterEqual(float(det.face_match_confidence or 0), 0.9)


if __name__ == "__main__":
    unittest.main()
