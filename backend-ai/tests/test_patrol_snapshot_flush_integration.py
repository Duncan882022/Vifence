"""Snapshot thật — JPG, overlay bbox, throttle flush, cửa sổ 2s."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import cv2
import numpy as np

from app.patrol import daystore, db, sink
from app.patrol.aggregator.engine import finalize_track, ingest_observation
from app.patrol.aggregator.flush import APPEARANCE_WRITE_MIN_INTERVAL_SEC, flush_session
from app.patrol.aggregator.session_store import get_or_create, reset
from app.patrol.aggregator.types import ObservationInput
from app.patrol_person_visibility import patrol_person_overlay_bbox


class PatrolSnapshotFlushIntegrationTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        db.close()
        db.DATA_DIR = Path(self._tmp.name)
        db.DB_FILE = Path(self._tmp.name) / "patrol.db"
        sink.SNAPSHOT_DIR = db.DATA_DIR / "patrol_snapshots"
        db.get_conn()
        reset()
        sink.reset()

    def tearDown(self) -> None:
        reset()
        sink.reset()
        db.close()
        self._tmp.cleanup()

    def test_real_jpg_snapshot_written_on_disk(self) -> None:
        """Ghi JPG thật — file tồn tại, ROI overlay bbox hợp lệ."""
        frame = np.zeros((720, 1280, 3), dtype=np.uint8)
        frame[200:500, 400:800] = (40, 40, 40)
        bbox = (400.0, 200.0, 800.0, 500.0)
        draw = patrol_person_overlay_bbox(bbox, 1280, 720)
        ts = 12_000.0

        rel = sink._write_snapshot(  # noqa: SLF001
            "obj-20260830-0200",
            frame,
            draw,
            score=1.1,
            tier="object",
            capture_ts=ts,
        )
        self.assertIsNotNone(rel)
        full = sink.resolve_snapshot_path(str(rel))
        self.assertIsNotNone(full)
        assert full is not None
        self.assertTrue(full.is_file())
        img = cv2.imread(str(full))
        self.assertIsNotNone(img)
        assert img is not None
        self.assertGreater(img.shape[0], 0)
        self.assertGreater(img.shape[1], 0)

    def test_engine_throttle_one_appearance_many_ingests(self) -> None:
        """30 frame trong 15s — một lượt appearance, không spam INSERT."""
        ts = 13_000.0
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        bbox = (100.0, 80.0, 220.0, 400.0)

        with patch(
            "app.patrol.aggregator.flush._gate_observation_commit",
            return_value=(True, ts),
        ):
            for i in range(30):
                ingest_observation(
                    camera_id="DR-03",
                    track_id="ptk-throttle",
                    now=ts + i * 0.5,
                    person_bbox=bbox,
                    frame=frame,
                    confidence=0.85,
                )

        rows = daystore.list_day_presences(db.today_vn(ts))
        self.assertEqual(len(rows), 1)

    def test_window_end_flush_updates_ended_at(self) -> None:
        """Sau cửa sổ 2s — flush cập nhật ended_at dù chưa đủ 10s."""
        ts = 14_000.0
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        bbox = (100.0, 80.0, 220.0, 400.0)

        with patch(
            "app.patrol.aggregator.flush._gate_observation_commit",
            return_value=(True, ts),
        ), patch(
            "app.patrol.sink._write_snapshot",
            return_value="2026-08-30/win-end.jpg",
        ):
            ingest_observation(
                camera_id="HC-02",
                track_id="ptk-win",
                now=ts,
                person_bbox=bbox,
                frame=frame,
                confidence=0.9,
            )
            ingest_observation(
                camera_id="HC-02",
                track_id="ptk-win",
                now=ts + 2.2,
                person_bbox=bbox,
                frame=frame,
                confidence=0.92,
            )

        rows = daystore.list_day_presences(db.today_vn(ts))
        self.assertEqual(len(rows), 1)
        self.assertAlmostEqual(float(rows[0]["ended_at"]), ts + 2.2, places=2)

    def test_appearance_throttle_skips_rapid_upsert(self) -> None:
        """Hai flush cách <2s — appearance UPDATE lần 2 bị bỏ qua."""
        ts = 15_000.0
        session = get_or_create("HC-02", "ptk-ap", ts=ts)
        row_id = daystore.upsert_track_appearance(
            appearance_id=None,
            event_date=db.today_vn(ts),
            subject_id="obj-20260830-0300",
            camera_id="HC-02",
            zone_id=None,
            track_id="ptk-ap",
            session_id="sess-ap",
            started_at=ts,
            ended_at=ts + 1,
            gps_lat=20.93,
            gps_lng=106.92,
            payload_json='{"track_id":"ptk-ap"}',
            interactions_json="[]",
            snapshot_path="2026-08-30/ap.jpg",
        )
        session.subject_id = "obj-20260830-0300"
        session.appearance_row_id = row_id
        session.committed = True
        session.last_flush_at = ts + 1
        session.dirty = True

        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        bbox = (100.0, 80.0, 220.0, 400.0)
        obs = ObservationInput(
            camera_id="HC-02",
            track_id="ptk-ap",
            ts=ts + 1 + APPEARANCE_WRITE_MIN_INTERVAL_SEC * 0.4,
            person_bbox=bbox,
            frame=frame,
            confidence=0.9,
        )
        with patch(
            "app.patrol.aggregator.flush._write_snapshot",
            return_value=(None, None, 0.0),
        ):
            flush_session(session, obs)
        snap = db.query_one(
            "SELECT ended_at FROM appearances WHERE id = ?",
            (row_id,),
        )
        self.assertAlmostEqual(float(snap["ended_at"]), ts + 1, places=2)

    def test_card_and_luot_snapshots_are_separate_files(self) -> None:
        """Thẻ giữ khung đẹp nhất, mỗi lượt giữ khung của chính nó."""
        ts = 17_000.0
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        frame[100:400, 100:220] = (90, 90, 90)
        bbox = (100.0, 80.0, 220.0, 400.0)

        with patch(
            "app.patrol.aggregator.flush._gate_observation_commit",
            return_value=(True, ts),
        ):
            ingest_observation(
                camera_id="HC-01",
                track_id="ptk-split",
                now=ts,
                person_bbox=bbox,
                frame=frame,
                confidence=0.9,
            )
            finalize_track("HC-01", "ptk-split", now=ts + 0.4)

        objs = daystore.list_objects(db.today_vn(ts))
        self.assertEqual(len(objs), 1)
        card_path = str(objs[0]["snapshot_path"] or "")
        rows = db.query(
            "SELECT snapshot_path FROM appearances WHERE event_date = ?",
            (db.today_vn(ts),),
        )
        self.assertEqual(len(rows), 1)
        luot_path = str(rows[0]["snapshot_path"] or "")

        self.assertTrue(card_path)
        self.assertTrue(luot_path)
        self.assertNotEqual(card_path, luot_path)
        for rel in (card_path, luot_path):
            full = sink.resolve_snapshot_path(rel)
            self.assertIsNotNone(full)
            assert full is not None
            self.assertTrue(full.is_file())

    def test_two_luot_of_one_subject_get_distinct_images(self) -> None:
        """Hai lượt khác nhau — hai file ảnh khác nhau, không dùng chung một tấm."""
        ts = 18_000.0
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        bbox = (100.0, 80.0, 220.0, 400.0)

        with patch(
            "app.patrol.aggregator.flush._gate_observation_commit",
            return_value=(True, ts),
        ):
            for index, track in enumerate(("ptk-l1", "ptk-l2")):
                at = ts + index * 120.0
                ingest_observation(
                    camera_id="HC-01",
                    track_id=track,
                    now=at,
                    person_bbox=bbox,
                    frame=frame,
                    confidence=0.9,
                )
                finalize_track("HC-01", track, now=at + 0.4)

        rows = db.query(
            "SELECT snapshot_path FROM appearances WHERE event_date = ?",
            (db.today_vn(ts),),
        )
        paths = [str(r["snapshot_path"] or "") for r in rows]
        self.assertEqual(len(paths), 2)
        self.assertTrue(all(paths))
        self.assertEqual(len(set(paths)), 2)

    def test_finalize_always_persists_best_snapshot(self) -> None:
        """Finalize — luôn chốt best frame dù throttle đang khóa."""
        ts = 16_000.0
        good = np.zeros((480, 640, 3), dtype=np.uint8)
        good[:, :, 1] = 200
        bad = np.zeros((480, 640, 3), dtype=np.uint8)
        bbox = (100.0, 80.0, 220.0, 400.0)

        with patch(
            "app.patrol.aggregator.flush._gate_observation_commit",
            return_value=(True, ts),
        ), patch(
            "app.patrol.sink._write_snapshot",
            side_effect=lambda *a, **k: f"2026-08-30/sc-{k.get('score', 0):.2f}.jpg",
        ):
            ingest_observation(
                camera_id="DR-03",
                track_id="ptk-fin",
                now=ts,
                person_bbox=bbox,
                frame=good,
                confidence=0.95,
                face_quality=0.0,
            )
            ingest_observation(
                camera_id="DR-03",
                track_id="ptk-fin",
                now=ts + 0.3,
                person_bbox=bbox,
                frame=bad,
                confidence=0.1,
            )
            finalize_track("DR-03", "ptk-fin", now=ts + 0.4)

        objs = daystore.list_objects(db.today_vn(ts))
        self.assertEqual(len(objs), 1)
        path = str(objs[0].get("snapshot_path") or "")
        self.assertIn("sc-0.95", path)


if __name__ == "__main__":
    unittest.main()
