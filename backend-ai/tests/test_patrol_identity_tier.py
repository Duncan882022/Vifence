"""patrol_tier_label + tier_for_worker_id — pers/iden/gallery."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app import patrol_identity_store  # noqa: E402
from app.patrol import db, identity  # noqa: E402
from app.patrol_entity import patrol_tier_label  # noqa: E402
from app.patrol_identity_lifecycle import TIER_IDENTITY, TIER_PERSON, tier_for_worker_id  # noqa: E402


class PatrolIdentityTierTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self._root = Path(self._tmpdir.name)
        self._old_db = db.DB_FILE
        db.DB_FILE = self._root / "patrol_test.db"
        db.close()
        db.get_conn()
        # Bindings sống trong JSON ngoài SQLite; nếu không cô lập thì mã tk-* cấp
        # trong test đụng đúng alias có sẵn của repo và nhảy nhầm lên tier định danh.
        self._bindings = patch(
            "app.patrol_identity_store._load",
            return_value=patrol_identity_store._empty(),
        )
        self._bindings.start()
        self.addCleanup(self._bindings.stop)

    def tearDown(self) -> None:
        db.close()
        db.DB_FILE = self._old_db
        self._tmpdir.cleanup()

    def test_pers_identified_resolves_identity_tier(self) -> None:
        # `sgc-*` và `tk-*` là tiền tố nội bộ, schema cấm dùng làm mã nhân sự thật.
        row = identity.import_identity(
            full_name="Duncan",
            employee_code="NV-6688",
            contractor="SGC",
            source="self_enroll",
        )
        pers_id = str(row["pers_id"])
        self.assertEqual(patrol_tier_label(pers_id), TIER_IDENTITY)
        self.assertEqual(tier_for_worker_id(pers_id), TIER_IDENTITY)

    def test_pers_anonymous_is_person_tier(self) -> None:
        pers_id = identity.allocate_tk_profile(origin="camera")
        self.assertEqual(patrol_tier_label(pers_id), TIER_PERSON)


if __name__ == "__main__":
    unittest.main()
