"""Unit tests — drone pixel heatmap accumulation."""

from __future__ import annotations

import unittest

from app.drone_heatmap import (
    get_drone_heatmap_metrics,
    get_drone_heatmap_png_path,
    ingest_drone_detections,
    reset_drone_heatmap,
)


class DroneHeatmapTests(unittest.TestCase):
    def setUp(self) -> None:
        reset_drone_heatmap()

    def tearDown(self) -> None:
        reset_drone_heatmap()

    def test_accumulates_and_tracks_metrics(self) -> None:
        dets = [{
            "behavior": "person",
            "confidence": 0.72,
            "bbox": [100.0, 200.0, 140.0, 320.0],
            "track_id": "ptk0001:person",
        }]
        ingest_drone_detections(
            "DR-03",
            1280,
            720,
            dets,
            metrics={"frame_person_count": 1, "track_count": 1},
        )
        metrics = get_drone_heatmap_metrics("DR-03")
        self.assertEqual(metrics["frame_person_count"], 1)
        self.assertEqual(metrics["track_count"], 1)

    def test_render_png_after_interval(self) -> None:
        from app import drone_heatmap as mod

        original = mod.RENDER_INTERVAL_SEC
        mod.RENDER_INTERVAL_SEC = 0.0
        try:
            ingest_drone_detections(
                "DR-03",
                640,
                360,
                [{"behavior": "person", "confidence": 0.8, "bbox": [80, 40, 120, 200]}],
                metrics={"frame_person_count": 1, "track_count": 1},
            )
            path = get_drone_heatmap_png_path("DR-03")
            self.assertIsNotNone(path)
            self.assertTrue(path.is_file())
        finally:
            mod.RENDER_INTERVAL_SEC = original


if __name__ == "__main__":
    unittest.main()
