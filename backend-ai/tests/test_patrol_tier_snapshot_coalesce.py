"""tier_ever vs tier_snapshot — không lệch object trên thẻ tk-*."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.patrol import db, daystore, identity  # noqa: E402
from app.patrol.api import _coalesce_tier_snapshot_with_ever  # noqa: E402


class TierSnapshotCoalesceTests(unittest.TestCase):
    def test_coalesce_on_read_upgrades_object_to_person(self) -> None:
        snap = {
            "tier": "object",
            "tier_at_observation": "object",
            "tier_rank": 0,
            "subject_id": "tk-0000001",
        }
        out = _coalesce_tier_snapshot_with_ever("person", snap)
        self.assertIsNotNone(out)
        assert out is not None
        self.assertEqual(out["tier"], "person")
        self.assertEqual(out["tier_at_observation"], "person")

    def test_upsert_event_tier_ever_upgrades_snapshot_json(self) -> None:
        tmp = tempfile.TemporaryDirectory()
        db.close()
        db.DATA_DIR = Path(tmp.name)
        db.DB_FILE = Path(tmp.name) / "patrol.db"
        db.get_conn()

        ts = 1_700_000_000.0
        date = db.today_vn(ts)
        pid = "tk-0000099"
        identity.ensure_draft_for_tk(pid, now=ts)

        stale = json.dumps(
            {
                "tier": "object",
                "tier_at_observation": "object",
                "tier_rank": 0,
                "subject_id": pid,
            },
            ensure_ascii=False,
        )
        with db.tx() as conn:
            conn.execute(
                "UPDATE daily_events SET tier_ever = ?, tier_snapshot_json = ?,"
                " snapshot_path = ?, snapshot_score = ?"
                " WHERE event_date = ? AND pers_id = ?",
                ("object", stale, f"{date}/{pid}-1.jpg", 2.0, date, pid),
            )

        daystore.touch_person_event(
            pid,
            camera_id="HC-01",
            snapshot_path=f"{date}/{pid}-1.jpg",
            snapshot_score=2.0,
            face_eligible=True,
            now=ts + 1,
            tier_snapshot_json=stale,
        )

        row = db.query_one(
            "SELECT tier_ever, tier_snapshot_json FROM daily_events"
            " WHERE event_date = ? AND pers_id = ?",
            (date, pid),
        )
        self.assertIsNotNone(row)
        payload = json.loads(str(row["tier_snapshot_json"]))
        self.assertEqual(row["tier_ever"], "person")
        self.assertEqual(payload["tier"], "person")

        db.close()
        tmp.cleanup()


if __name__ == "__main__":
    unittest.main()
