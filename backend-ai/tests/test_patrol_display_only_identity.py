"""Display-only patrol detections — ROI payload không chạy face/embed."""

from __future__ import annotations

import unittest
from unittest.mock import patch

import numpy as np

from app.ppe_analyzer import (
    _PersonPpe,
    _assign_patrol_person_display_only,
    _assign_patrol_person_identity,
    _build_patrol_person_detections,
    _patrol_person_passes_display_gate,
    _patrol_person_passes_event_gate,
)
from app.schemas import PpeDetection


class PatrolDisplayOnlyIdentityTests(unittest.TestCase):
    FW, FH = 1280, 720

    def test_seated_person_is_display_only_not_event_gate(self) -> None:
        seated = (520.0, 420.0, 680.0, 690.0)
        self.assertFalse(_patrol_person_passes_event_gate(seated, self.FW, self.FH))

    @patch("app.ppe_analyzer._assign_patrol_person_identity")
    @patch("app.ppe_analyzer._assign_patrol_person_display_only")
    @patch("app.ppe_analyzer.assign_patrol_track_ids", return_value=["ptk0001:person"])
    def test_build_runs_identity_for_seated_display_gate_person(
        self,
        _assign_tracks,
        mock_display_only,
        mock_full_identity,
    ) -> None:
        """Người ngồi vẫn qua display gate — phải chạy identity + ghi sink."""
        frame = np.zeros((self.FH, self.FW, 3), dtype=np.uint8)
        seated = _PersonPpe(person_box=(520.0, 420.0, 680.0, 690.0), person_conf=0.52)
        self.assertTrue(_patrol_person_passes_display_gate(seated.person_box, self.FW, self.FH, camera_id="HC-02"))
        _build_patrol_person_detections(frame, "HC-02", [seated], self.FW, self.FH)

        mock_full_identity.assert_called_once()
        mock_display_only.assert_not_called()

    @patch("app.ppe_analyzer._assign_patrol_person_identity")
    @patch("app.ppe_analyzer._assign_patrol_person_display_only")
    @patch("app.ppe_analyzer.assign_patrol_track_ids", return_value=["ptk0001:person"])
    def test_build_skips_identity_for_limb_fragment(
        self,
        _assign_tracks,
        mock_display_only,
        mock_full_identity,
    ) -> None:
        frame = np.zeros((self.FH, self.FW, 3), dtype=np.uint8)
        shin = _PersonPpe(person_box=(560.0, 560.0, 660.0, 706.0), person_conf=0.52)
        self.assertFalse(_patrol_person_passes_display_gate(shin.person_box, self.FW, self.FH, camera_id="HC-02"))
        _build_patrol_person_detections(frame, "HC-02", [shin], self.FW, self.FH)

        mock_display_only.assert_called_once()
        mock_full_identity.assert_not_called()

    @patch("app.ppe_analyzer._assign_patrol_person_identity")
    @patch("app.ppe_analyzer._assign_patrol_person_display_only")
    @patch("app.ppe_analyzer.assign_patrol_track_ids", return_value=["ptk0001:person"])
    def test_build_runs_full_identity_for_event_gate_person(
        self,
        _assign_tracks,
        mock_display_only,
        mock_full_identity,
    ) -> None:
        frame = np.zeros((self.FH, self.FW, 3), dtype=np.uint8)
        standing = _PersonPpe(person_box=(400.0, 120.0, 560.0, 620.0), person_conf=0.71)
        _build_patrol_person_detections(frame, "HC-02", [standing], self.FW, self.FH)

        mock_full_identity.assert_called_once()
        mock_display_only.assert_not_called()

    def test_display_only_peeks_cached_tier(self) -> None:
        from app.patrol_identity_lifecycle import observe, reset

        reset("HC-02")
        observe(
            "HC-02",
            "ptk0099:person",
            worker_id="sgc-00000042",
            worker_name="sgc-00000042",
            now=1.0,
        )

        det = PpeDetection(
            behavior="person",
            label="person",
            scenario_id="person",
            confidence=0.4,
            bbox=[100.0, 100.0, 200.0, 400.0],
        )
        _assign_patrol_person_display_only(
            det,
            camera_id="HC-02",
            track_id="ptk0099:person",
        )
        self.assertEqual(det.track_id, "ptk0099:person")
        self.assertEqual(det.worker_id, "sgc-00000042")
        self.assertEqual(det.tier, "person")


if __name__ == "__main__":
    unittest.main()
