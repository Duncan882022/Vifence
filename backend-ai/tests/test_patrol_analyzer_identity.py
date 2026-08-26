"""Nhãn ROI trên HC-* — chỉ người thấy mặt mới được cấp mã sgc (tab Người).

Đường /analyze/frame từng cấp mã cho mọi bbox, kể cả người quay lưng, nên hai
cái lưng trong quán cà phê cũng thành "Người" thay vì "Đối tượng".
"""

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

from app.ppe_analyzer import (  # noqa: E402
    _assign_patrol_person_identity,
    assign_patrol_track_ids,
)
from app.schemas import PpeDetection  # noqa: E402


def _face_emb(seed: int) -> np.ndarray:
    from app.person_identity_registry import _expected_emb_dim

    vec = np.zeros(_expected_emb_dim(), dtype=np.float64)
    vec[int(seed) % len(vec)] = 1.0
    return vec


def _person_det() -> PpeDetection:
    return PpeDetection(
        behavior="person",
        label="person",
        scenario_id="PERS-001",
        confidence=0.85,
        bbox=[100.0, 120.0, 340.0, 640.0],
    )


class PatrolAnalyzerIdentityTests(unittest.TestCase):
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
        self.frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        from app.patrol_identity_lifecycle import reset as reset_lifecycle
        from app.patrol_tracker import reset_patrol_trackers
        from app.ppe_analyzer import _hc_frame_face_assignments

        _hc_frame_face_assignments.clear()
        reset_patrol_trackers()
        reset_lifecycle()
        self._now = 1000.0

    def tearDown(self) -> None:
        for p in reversed(self._patches):
            p.stop()
        self._tmpdir.cleanup()

    def _assign(self, det: PpeDetection, face: tuple) -> None:
        """Đi đúng đường thật: tracker gán id cho cả frame, rồi mới tới định danh."""
        box = (det.bbox[0], det.bbox[1], det.bbox[2], det.bbox[3])
        self._now += 0.2
        track_id = assign_patrol_track_ids(
            "HC-02", [(box, det.confidence)], now=self._now,
        )[0]
        with patch("app.worker_identity.recognizer.assess_patrol_face", return_value=face):
            _assign_patrol_person_identity(
                det,
                box,
                frame=self.frame,
                camera_id="HC-02",
                frame_w=1280,
                frame_h=720,
                track_id=track_id,
            )

    def _registry_tracks(self) -> dict:
        return json.loads(self._reg_file.read_text(encoding="utf-8")).get("tracks", {})

    def test_back_turned_gets_no_sgc(self) -> None:
        det = _person_det()
        self._assign(det, (None, 0.0, False))

        self.assertEqual(det.worker_id, "")
        self.assertFalse(det.face_eligible)
        self.assertTrue(det.track_id)
        # Không được ghi mã nào vào registry cho một cái lưng.
        self.assertEqual(self._registry_tracks(), {})

    def test_face_visible_gets_sgc(self) -> None:
        det = _person_det()
        self._assign(det, (_face_emb(3), 0.88, True))

        self.assertTrue(str(det.worker_id).startswith("sgc-"))
        self.assertTrue(det.face_eligible)

    def test_identified_person_keeps_id_after_turning_around(self) -> None:
        det_face = _person_det()
        self._assign(det_face, (_face_emb(3), 0.88, True))
        assigned = det_face.worker_id
        self.assertTrue(str(assigned).startswith("sgc-"))

        det_back = _person_det()
        self._assign(det_back, (None, 0.0, False))

        self.assertEqual(det_back.worker_id, assigned)
        self.assertFalse(det_back.face_eligible)

    def test_embedding_without_eligibility_is_not_trusted(self) -> None:
        """Có vector nhưng YuNet không đủ điểm — vẫn là Đối tượng."""
        det = _person_det()
        self._assign(det, (_face_emb(5), 0.2, False))

        self.assertEqual(det.worker_id, "")
        self.assertEqual(self._registry_tracks(), {})


if __name__ == "__main__":
    unittest.main()
