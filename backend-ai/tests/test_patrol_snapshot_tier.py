"""Snapshot ROI tier — đồng bộ màu khung với lifecycle ROI live."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from app.patrol import db, identity, sink
from app.patrol_identity_lifecycle import TIER_OBJECT, TIER_PERSON


class PatrolSnapshotTierTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        db.close()
        db.DATA_DIR = Path(self._tmp.name)
        db.DB_FILE = Path(self._tmp.name) / "patrol.db"
        db.get_conn()
        sink.reset()

    def tearDown(self) -> None:
        sink.reset()
        db.close()
        self._tmp.cleanup()

    def test_resolve_prefers_lifecycle_over_sqlite_identity(self) -> None:
        pers_id, _ = identity.observe_face([0.1] * 128, quality=0.9)
        identity.identify(pers_id, full_name="An", employee_code="NV01")

        self.assertEqual(sink._snapshot_tier(pers_id), "identity")
        self.assertEqual(
            sink._resolve_snapshot_tier(pers_id, tier=TIER_PERSON),
            TIER_PERSON,
        )

    def test_object_subject_always_slate_tier(self) -> None:
        self.assertEqual(
            sink._resolve_snapshot_tier("obj-0001", tier="identity"),
            TIER_OBJECT,
        )


if __name__ == "__main__":
    unittest.main()
