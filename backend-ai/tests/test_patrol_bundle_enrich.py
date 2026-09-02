"""Tests — bundle enrichment for day/bundle."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.patrol.bundle_enrich import (  # noqa: E402
    gps_lookup_from_presences,
    resolve_track_worker_id,
)


class TestBundleEnrich(unittest.TestCase):
    def test_gps_lookup_picks_latest_presence(self):
        presences = [
            {
                "subject_id": "obj-1",
                "gps_lat": 10.0,
                "gps_lng": 106.0,
                "gps_lat_end": 10.1,
                "gps_lng_end": 106.1,
                "ended_at": 100.0,
                "presence_seq": 1,
            },
            {
                "subject_id": "obj-1",
                "gps_lat_end": 10.2,
                "gps_lng_end": 106.2,
                "ended_at": 200.0,
                "presence_seq": 2,
            },
        ]
        gps = gps_lookup_from_presences(presences)
        self.assertAlmostEqual(gps["obj-1"][0], 10.2)
        self.assertAlmostEqual(gps["obj-1"][1], 106.2)

    def test_resolve_track_worker_id_from_map_or_pers(self):
        tk_map = {"pers-42": "tk-0012345"}
        self.assertEqual(resolve_track_worker_id("pers-42", tk_map), "tk-0012345")
        self.assertEqual(resolve_track_worker_id("tk-0099999", {}), "tk-0099999")


if __name__ == "__main__":
    unittest.main()
