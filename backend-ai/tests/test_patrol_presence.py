"""Presence merge/split — GPS + T_max."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import numpy as np

from app.patrol import db, daystore, identity
from app.patrol.presence import haversine_m, should_extend_presence


def _vec(seed: int, dim: int = 128) -> list[float]:
    rng = np.random.default_rng(seed)
    v = rng.normal(size=dim).astype(np.float32)
    return (v / np.linalg.norm(v)).tolist()


def _touch_person_card(
    pers_id: str,
    *,
    camera_id: str = "HC-01",
    now: float = 1_000.0,
    snapshot_path: str = "20260829/test.jpg",
    snapshot_score: float = 1.2,
    **kwargs,
) -> None:
    daystore.touch_person_event(
        pers_id,
        camera_id=camera_id,
        snapshot_path=snapshot_path,
        snapshot_score=snapshot_score,
        face_eligible=True,
        now=now,
        **kwargs,
    )


class PresenceGeoTest(unittest.TestCase):
    def test_haversine_zero_same_point(self) -> None:
        self.assertAlmostEqual(haversine_m(10.0, 106.0, 10.0, 106.0), 0.0, places=1)

    def test_haversine_roughly_50m(self) -> None:
        # ~0.00045° lat ≈ 50m near equator
        d = haversine_m(10.0, 106.0, 10.00045, 106.0)
        self.assertGreater(d, 40.0)
        self.assertLess(d, 60.0)


class PresenceDbTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        db.close()
        db.DATA_DIR = Path(self._tmp.name)
        db.DB_FILE = Path(self._tmp.name) / "patrol.db"
        db.get_conn()

    def tearDown(self) -> None:
        db.close()
        self._tmp.cleanup()

    def test_gps_merge_same_spot_one_encounter(self) -> None:
        pers_id, _ = identity.observe_face(_vec(101), quality=0.8)
        lat, lng = 10.772100, 106.659200
        daystore.touch_person_event(
            pers_id, camera_id="HC-01", now=1_000.0,
            gps_lat=lat, gps_lng=lng,
        )
        daystore.touch_person_event(
            pers_id, camera_id="HC-01", now=1_030.0,
            gps_lat=lat + 0.00001, gps_lng=lng,
        )
        stats = daystore.day_stats(db.today_vn(1_000.0))
        self.assertEqual(stats["encounters_standard"], 1)

    def test_gps_split_far_apart_two_encounters(self) -> None:
        pers_id, _ = identity.observe_face(_vec(102), quality=0.8)
        _touch_person_card(
            pers_id, camera_id="HC-01", now=2_000.0,
            gps_lat=10.772100, gps_lng=106.659200,
        )
        _touch_person_card(
            pers_id, camera_id="HC-01", now=2_100.0,
            gps_lat=10.773000, gps_lng=106.659200,
        )
        stats = daystore.day_stats(db.today_vn(2_000.0))
        self.assertEqual(stats["encounters_standard"], 2)
        self.assertEqual(stats["workers_standard"], 1)

    def test_cross_camera_keeps_separate_appearance_rows_with_gps(self) -> None:
        """Cùng GPS — mỗi camera vẫn một dòng lịch sử (upsert thẻ, không gộp popup)."""
        pers_id, _ = identity.observe_face(_vec(103), quality=0.8)
        lat, lng = 10.772100, 106.659200
        daystore.touch_person_event(
            pers_id, camera_id="HC-01", now=3_000.0,
            gps_lat=lat, gps_lng=lng,
        )
        daystore.touch_person_event(
            pers_id, camera_id="HC-02", now=3_020.0,
            gps_lat=lat, gps_lng=lng,
        )
        hist = daystore.list_appearances(pers_id, db.today_vn(3_000.0))
        self.assertEqual(len(hist["segments"]), 2)
        self.assertIn("HC-01", hist["by_camera"])
        self.assertIn("HC-02", hist["by_camera"])
        cards = daystore.list_person_events(db.today_vn(3_000.0))
        self.assertEqual(len(cards), 1)
        self.assertEqual(cards[0]["pers_id"], pers_id)

    def test_obj_unassigned_separate_kpi(self) -> None:
        """Thẻ Đối tượng đếm riêng, và không cộng vào bộ đếm Nhân sự."""
        date = db.today_vn(4_000.0)
        obj_id = daystore.touch_object(
            None, camera_id="HC-01", now=4_000.0,
            gps_lat=10.772100, gps_lng=106.659200,
            snapshot_path="back.jpg",
            snapshot_score=0.5,
        )
        # Lượt gặp chỉ được chốt khi track đóng lại — thẻ mở ra chưa phải một lượt.
        stats = daystore.day_stats(date)
        self.assertEqual(stats["object_card_count"], 1)
        self.assertEqual(stats["object_sighting_count"], 0)

        daystore.record_sighting(
            event_date=date,
            subject_id=obj_id,
            camera_id="HC-01",
            zone_id=None,
            track_id="ptk0001:person",
            session_id="sess-HC-01-a",
            started_at=4_000.0,
            ended_at=4_010.0,
            end_reason="exit_edge",
            qualified=True,
            now=4_010.0,
        )

        stats = daystore.day_stats(date)
        self.assertEqual(stats["unassigned_observations"], 1)
        self.assertEqual(stats["object_sighting_count"], 1)
        self.assertEqual(stats["encounters_standard"], 0)
        self.assertEqual(stats["workers_standard"], 0)
        self.assertEqual(stats["object_card_count"], 1)
        self.assertEqual(
            stats["workers_standard"],
            stats["person_count"] + stats["identity_count"],
        )

    def test_list_day_presences_includes_gps(self) -> None:
        pers_id, _ = identity.observe_face(_vec(104), quality=0.8)
        daystore.touch_person_event(
            pers_id, camera_id="HC-01", now=5_000.0,
            gps_lat=10.772100, gps_lng=106.659200,
        )
        presences = daystore.list_day_presences(db.today_vn(5_000.0))
        self.assertEqual(len(presences), 1)
        self.assertAlmostEqual(float(presences[0]["gps_lat"]), 10.772100, places=4)


class ShouldExtendPresenceTest(unittest.TestCase):
    def test_no_gps_same_camera_short_gap(self) -> None:
        row = {"ended_at": 100.0, "camera_id": "HC-01", "gps_lat": None, "gps_lng": None}
        self.assertTrue(
            should_extend_presence(row, 120.0, None, None, camera_id="HC-01"),
        )

    def test_no_gps_different_camera_no_merge(self) -> None:
        row = {"ended_at": 100.0, "camera_id": "HC-01", "gps_lat": None, "gps_lng": None}
        self.assertFalse(
            should_extend_presence(row, 110.0, None, None, camera_id="HC-02"),
        )


if __name__ == "__main__":
    unittest.main()
