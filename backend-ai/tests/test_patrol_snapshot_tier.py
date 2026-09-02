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

    def test_resolve_respects_lifecycle_person_over_sqlite_identity(self) -> None:
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

    def test_stale_object_lifecycle_upgrades_with_gallery_worker(self) -> None:
        pers_id, _ = identity.observe_face([0.2] * 128, quality=0.9)
        identity.identify(pers_id, full_name="Duncan", employee_code="NV6688")
        self.assertEqual(
            sink._resolve_snapshot_tier(
                pers_id,
                tier=TIER_OBJECT,
                worker_id="p-NV6688",
            ),
            "identity",
        )

    def test_stale_object_lifecycle_uses_sqlite_for_pers(self) -> None:
        pers_id, _ = identity.observe_face([0.3] * 128, quality=0.9)
        identity.identify(pers_id, full_name="An", employee_code="NV01")
        self.assertEqual(
            sink._resolve_snapshot_tier(pers_id, tier=TIER_OBJECT),
            "identity",
        )

    def test_evidence_gate_downgrades_identified_profile_to_object(self) -> None:
        pers_id, _ = identity.observe_face([0.4] * 128, quality=0.9)
        identity.identify(pers_id, full_name="Duncan", employee_code="NV6688")
        self.assertEqual(sink._resolve_snapshot_tier(pers_id, tier="identity"), "identity")
        self.assertFalse(
            sink._snapshot_meets_person_evidence_gate(
                face_eligible=False,
                snapshot_score=2.5,
            )
        )
        self.assertFalse(
            sink._snapshot_meets_person_evidence_gate(
                face_eligible=True,
                snapshot_score=0.9,
            )
        )
        self.assertTrue(
            sink._snapshot_meets_person_evidence_gate(
                face_eligible=True,
                snapshot_score=1.2,
            )
        )


if __name__ == "__main__":
    unittest.main()
