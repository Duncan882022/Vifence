"""
Module 05 — Workforce engine unit tests
specs/module05/REALTIME_WORKFORCE_HEATMAP_SPECIFICATION.md §3–§10
"""
from __future__ import annotations

import math
import sys
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.workforce_engine import (  # noqa: E402
    FACE_VERIFY,
    HEAT_INTERVAL_S,
    REID_STRICT,
    TTL_ACTIVE_S,
    TTL_RECENT_S,
    WorkforceEngine,
    classify_observation_mode,
    compute_observability,
    forward_geodesic,
    mode_allows_position,
    mode_counts_population,
)


def _full_body_bbox(fw=1280, fh=720):
    # Tall person mid-frame → FULL_BODY
    return [fw * 0.42, fh * 0.15, fw * 0.58, fh * 0.95]


def _upper_bbox(fw=1280, fh=720):
    return [fw * 0.40, fh * 0.20, fw * 0.60, fh * 0.55]


def _closeup_bbox(fw=1280, fh=720):
    return [fw * 0.20, fh * 0.10, fw * 0.80, fh * 0.70]


def _partial_bbox(fw=1280, fh=720):
    return [fw * 0.45, fh * 0.80, fw * 0.52, fh * 0.92]


def _person(bbox, **extra):
    return {"label": "person", "behavior": "person", "bbox": bbox, "confidence": 0.9, **extra}


class TestObservationModes(unittest.TestCase):
    def test_classify_modes(self):
        self.assertEqual(classify_observation_mode(_full_body_bbox(), 1280, 720), "FULL_BODY")
        self.assertEqual(classify_observation_mode(_closeup_bbox(), 1280, 720), "FACE_CLOSEUP")
        self.assertEqual(classify_observation_mode(_partial_bbox(), 1280, 720), "PARTIAL_BODY")
        self.assertIn(classify_observation_mode(_upper_bbox(), 1280, 720), ("UPPER_BODY", "FULL_BODY"))

    def test_mode_gates(self):
        self.assertTrue(mode_counts_population("FULL_BODY"))
        self.assertTrue(mode_counts_population("UPPER_BODY"))
        self.assertFalse(mode_counts_population("FACE_CLOSEUP"))
        self.assertFalse(mode_counts_population("PARTIAL_BODY"))
        self.assertFalse(mode_allows_position("FACE_CLOSEUP"))
        self.assertFalse(mode_allows_position("PARTIAL_BODY"))


class TestObservability(unittest.TestCase):
    def test_closeup_lowers_band(self):
        rows = [
            {"observation_mode": "FACE_CLOSEUP", "bbox": _closeup_bbox(), "confidence": 0.95},
            {"observation_mode": "FACE_CLOSEUP", "bbox": _closeup_bbox(), "confidence": 0.95},
        ]
        s, band = compute_observability(rows, 1280, 720)
        self.assertLess(s, 0.75)
        self.assertIn(band, ("LOW", "MEDIUM"))

    def test_full_body_can_be_high(self):
        rows = [
            {"observation_mode": "FULL_BODY", "bbox": [100, 50, 200, 650], "confidence": 0.95},
            {"observation_mode": "FULL_BODY", "bbox": [300, 40, 400, 660], "confidence": 0.92},
        ]
        s, band = compute_observability(rows, 1280, 720)
        self.assertGreaterEqual(s, 0.45)
        self.assertIn(band, ("HIGH", "MEDIUM"))


class TestGeodesic(unittest.TestCase):
    def test_forward_geodesic_north(self):
        lat2, lon2 = forward_geodesic(10.0, 106.0, 0.0, 100.0)
        self.assertGreater(lat2, 10.0)
        self.assertAlmostEqual(lon2, 106.0, places=4)


class TestAcceptanceCriteria(unittest.TestCase):
    """§10 POC acceptance — automated cases."""

    def setUp(self):
        self.eng = WorkforceEngine()
        self.eng.update_helmet("HC-02", lat=10.762, lon=106.660, heading=90.0, online=True)

    def test_ac2_partial_body_no_object_no_count(self):
        out = self.eng.ingest_frame(
            "HC-02",
            [_person(_partial_bbox())],
            frame_w=1280,
            frame_h=720,
        )
        self.assertEqual(out["frame_countable"], 0)
        self.assertEqual(out["active_objects"], 0)
        snap = self.eng.snapshot("HC-02")
        self.assertEqual(len(snap["objects"]), 0)

    def test_ac3_full_to_closeup_keeps_one_object(self):
        self.eng.ingest_frame(
            "HC-02",
            [_person(_full_body_bbox(), track_id="t1")],
            frame_w=1280,
            frame_h=720,
        )
        oid1 = next(iter(self.eng.objects))
        self.eng.ingest_frame(
            "HC-02",
            [_person(_closeup_bbox(), track_id="t1")],
            frame_w=1280,
            frame_h=720,
        )
        self.assertEqual(len(self.eng.objects), 1)
        self.assertEqual(next(iter(self.eng.objects)), oid1)
        self.assertEqual(self.eng.objects[oid1].observation_mode, "FACE_CLOSEUP")

    def test_ac4_closeup_does_not_drop_population(self):
        full = [_person(_full_body_bbox(), track_id=f"t{i}") for i in range(3)]
        out1 = self.eng.ingest_frame("HC-02", full, frame_w=1280, frame_h=720)
        pop1 = out1["population"]["observed_count"]
        self.assertGreaterEqual(pop1, 1)

        close = [_person(_closeup_bbox(), track_id="t0")]
        out2 = self.eng.ingest_frame("HC-02", close, frame_w=1280, frame_h=720)
        # LOW / zero countable → hold previous
        if out2["population"]:
            self.assertEqual(out2["population"]["observed_count"], pop1)

    def test_ac5_face_verify_unknown_to_verified(self):
        self.eng.ingest_frame(
            "HC-02",
            [
                _person(
                    _full_body_bbox(),
                    track_id="t9",
                    worker_id="WRK-001",
                    worker_name="Nguyen Van A",
                    face_confidence=FACE_VERIFY,
                )
            ],
            frame_w=1280,
            frame_h=720,
        )
        obj = next(iter(self.eng.objects.values()))
        self.assertEqual(obj.identity_status, "VERIFIED")
        self.assertEqual(obj.worker_id, "WRK-001")
        ui_types = {e.event_type for e in self.eng.events if e.show_in_ui}
        self.assertIn("IDENTITY_VERIFIED", ui_types)

    def test_ac6_conservative_dedup_no_auto_merge(self):
        self.eng.ingest_frame(
            "HC-02",
            [_person(_full_body_bbox(), track_id="a", worker_name="Same", worker_id="sgc-1")],
            frame_w=1280,
            frame_h=720,
        )
        self.eng.ingest_frame(
            "HC-02",
            [_person(_full_body_bbox(), track_id="b", worker_name="Same", worker_id="sgc-2")],
            frame_w=1280,
            frame_h=720,
        )
        self.assertEqual(len(self.eng.objects), 2)
        for obj in self.eng.objects.values():
            for m in obj.possible_matches:
                self.assertLess(m.reid_similarity, REID_STRICT)

    def test_ac7_retroactive_merge_audit_only(self):
        ids = []
        for tid in ("m1", "m2"):
            self.eng.ingest_frame(
                "HC-02",
                [_person(_full_body_bbox(), track_id=tid)],
                frame_w=1280,
                frame_h=720,
            )
            ids.append(next(o.object_id for o in self.eng.objects.values() if o.track_id == tid))
        self.eng.merge_objects_to_worker(ids, "WRK-99", "Merged Worker")
        ui = [e for e in self.eng.events if e.show_in_ui and e.event_type == "OBJECT_MERGED"]
        self.assertEqual(ui, [])
        self.assertTrue(any(e.event_type == "OBJECT_MERGED" for e in self.eng.events))

    def test_ac8_raw_spam_does_not_flood_events(self):
        # 60 frames × 5 persons → many detections; events must stay sparse via cooldowns
        for i in range(60):
            dets = [_person(_full_body_bbox(), track_id=f"p{j}", confidence=0.9) for j in range(5)]
            self.eng.ingest_frame("HC-02", dets, frame_w=1280, frame_h=720)
            # nudge population to try triggering change
            if i == 30:
                dets = [_person(_full_body_bbox(), track_id=f"p{j}") for j in range(12)]
                self.eng.ingest_frame("HC-02", dets, frame_w=1280, frame_h=720)
        ui = [e for e in self.eng.events if e.show_in_ui]
        self.assertLess(len(ui), 5, f"expected <5 meaningful events, got {len(ui)}: {[e.event_type for e in ui]}")

    def test_ac9_heat_sampling_rate_limit(self):
        self.eng.ingest_frame(
            "HC-02",
            [_person(_full_body_bbox(), track_id="h1")],
            frame_w=1280,
            frame_h=720,
        )
        n1 = len(self.eng.heat_points)
        self.eng.ingest_frame(
            "HC-02",
            [_person(_full_body_bbox(), track_id="h1")],
            frame_w=1280,
            frame_h=720,
        )
        # Within HEAT_INTERVAL_S → no second sample
        self.assertEqual(len(self.eng.heat_points), n1)
        obj = next(iter(self.eng.objects.values()))
        obj.last_heat_at = time.time() - HEAT_INTERVAL_S - 0.1
        self.eng.ingest_frame(
            "HC-02",
            [_person(_full_body_bbox(), track_id="h1")],
            frame_w=1280,
            frame_h=720,
        )
        self.assertGreaterEqual(len(self.eng.heat_points), n1 + 1)

    def test_heat_time_decay_fades_stale_points(self):
        from app.workforce_engine import HEAT_DECAY_S

        self.eng.ingest_frame(
            "HC-02",
            [_person(_full_body_bbox(), track_id="d1")],
            frame_w=1280,
            frame_h=720,
        )
        self.assertGreaterEqual(len(self.eng.heat_points), 1)
        # Age the point well past decay horizon
        self.eng.heat_points[0].timestamp = time.time() - HEAT_DECAY_S * 5
        snap = self.eng.snapshot("HC-02")
        # Heavily decayed points dropped (<0.02) or weight much smaller
        if snap["heatPoints"]:
            self.assertLess(snap["heatPoints"][0]["weight"], 0.15)
        else:
            self.assertEqual(snap["heatPoints"], [])

    def test_ttl_active_recent_expired(self):
        self.eng.ingest_frame(
            "HC-02",
            [_person(_full_body_bbox(), track_id="ttl")],
            frame_w=1280,
            frame_h=720,
        )
        obj = next(iter(self.eng.objects.values()))
        now = time.time()
        self.assertEqual(obj.live_status(now), "ACTIVE")
        self.assertEqual(obj.live_status(now + TTL_ACTIVE_S + 1), "RECENTLY_OBSERVED")
        self.assertEqual(obj.live_status(now + TTL_RECENT_S + 1), "EXPIRED")
        snap = self.eng.snapshot("HC-02", now=now + TTL_RECENT_S + 5)
        self.assertEqual(len(snap["objects"]), 0)

    def test_population_only_high_medium(self):
        # Force many closeups → often LOW; count must not update from closeups alone
        before = self.eng.latest_population.get("ZONE-A3")
        close_only = [_person(_closeup_bbox()) for _ in range(4)]
        self.eng.ingest_frame("HC-02", close_only, frame_w=1280, frame_h=720)
        after = self.eng.latest_population.get("ZONE-A3")
        self.assertEqual(before, after)


class TestSnapshotContract(unittest.TestCase):
    def test_kv_keys(self):
        eng = WorkforceEngine()
        eng.update_helmet("HC-02", lat=10.0, lon=106.0, heading=45.0, online=True)
        eng.ingest_frame("HC-02", [_person(_full_body_bbox(), track_id="k1")], frame_w=1280, frame_h=720)
        snap = eng.snapshot("HC-02")
        for key in ("helmets", "objects", "zonePopulation", "heatPoints", "events", "server_time"):
            self.assertIn(key, snap)
        h = snap["helmets"]["HC-02"]
        self.assertEqual(h["type"], "HELMET_STATE")
        self.assertIsNotNone(h["heading"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
