"""Người đứng trong khung — không upsert thẻ; obj→tk giữ 2 dòng lịch sử."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.patrol import daystore, db, identity, sink  # noqa: E402


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


class PersonInFrameUpsertTest(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        db.close()
        db.DATA_DIR = Path(self._tmp.name)
        db.DB_FILE = Path(self._tmp.name) / "patrol.db"
        sink.SNAPSHOT_DIR = db.DATA_DIR / "patrol_snapshots"
        db.get_conn()
        sink.reset()

    def tearDown(self) -> None:
        sink.reset()
        db.close()
        self._tmp.cleanup()

    def test_draft_person_skips_card_upsert_while_in_frame(self) -> None:
        """Đứng trong khung — không ghi last_seen thẻ; lịch sử vẫn kéo ended_at."""
        pers_id, _ = identity.observe_face(_vec(71), quality=0.8)
        _touch_person_card(pers_id, now=1_000.0, snapshot_path="a.jpg", snapshot_score=1.2)
        _touch_person_card(pers_id, now=1_011.0, snapshot_path="b.jpg", snapshot_score=1.1)

        card = daystore.list_person_events(db.today_vn(1_000.0))[0]
        self.assertEqual(card["snapshot_path"], "a.jpg")
        self.assertEqual(card["last_seen"], 1_000.0)

        hist = daystore.list_appearances(pers_id, db.today_vn(1_000.0))
        self.assertEqual(len(hist["segments"]), 1)
        self.assertAlmostEqual(float(hist["segments"][0]["ended_at"]), 1_011.0, places=3)

    def test_promote_person_phase_row_not_extendable_as_object(self) -> None:
        """Sau promote — flush person không gộp lên dòng object-phase."""
        ts = 5_000.0
        date = db.today_vn(ts)
        obj_id = daystore.touch_object(
            None,
            camera_id="HC-01",
            snapshot_path=f"{date}/obj-back.jpg",
            snapshot_score=0.9,
            now=ts,
            skip_appearance=True,
        )
        daystore.upsert_track_appearance(
            appearance_id=None,
            event_date=date,
            subject_id=obj_id,
            camera_id="HC-01",
            zone_id=None,
            track_id="ptk-one",
            session_id="sess-one",
            started_at=ts,
            ended_at=ts + 4,
            gps_lat=20.93,
            gps_lng=106.92,
            payload_json=json.dumps({"tier_at_observation": "object"}),
            interactions_json="[]",
            snapshot_path=f"{date}/obj-back.jpg",
        )
        pers_id, _ = identity.observe_face(_vec(73), quality=0.8, now=ts - 60)
        person_phase_id = daystore.promote_object(obj_id, pers_id, now=ts + 5)
        self.assertIsNotNone(person_phase_id)

        extend_obj = daystore.find_extendable_track_appearance_row(
            date,
            pers_id,
            "HC-01",
            ts + 6,
            flush_tier="person",
        )
        self.assertEqual(extend_obj, person_phase_id)

        segments = daystore.list_appearances(pers_id, date)["segments"]
        self.assertEqual(len(segments), 2)
        obj_payload = json.loads(str(segments[0].get("event_payload_json") or "{}"))
        self.assertEqual(obj_payload.get("tier_at_observation"), "object")


if __name__ == "__main__":
    unittest.main()
