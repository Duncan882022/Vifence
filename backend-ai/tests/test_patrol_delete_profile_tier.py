"""Xóa hồ sơ → ROI/snapshot hạ về Người, không còn Định danh tím."""

from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.patrol import db, identity  # noqa: E402
from app.patrol_entity import (  # noqa: E402
    is_patrol_gallery_id,
    patrol_tier_label,
    resolve_patrol_worker_display_name,
)
from app.patrol_identity_lifecycle import (  # noqa: E402
    TIER_IDENTITY,
    TIER_PERSON,
    observe,
    reset as reset_lifecycle,
    revoke_gallery_worker,
    tier_for_worker_id,
)
from app.patrol_ids import normalize_track_id  # noqa: E402
from app.patrol_identity_store import (  # noqa: E402
    BINDINGS_FILE,
    bind_patrol_identity,
    patrol_gallery_worker_id,
)
from app.person_identity_registry import (  # noqa: E402
    REGISTRY_FILE,
    bind_patrol_track_identity,
    peek_patrol_track_identity,
    purge_gallery_worker_from_registry,
)


class PatrolDeleteProfileTierTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self._root = Path(self._tmpdir.name)
        self._old_db = db.DB_FILE
        self._old_data = db.DATA_DIR
        self._old_bindings = BINDINGS_FILE
        self._old_registry = REGISTRY_FILE
        import app.patrol_identity_store as identity_store
        import app.person_identity_registry as person_registry

        self._identity_store = identity_store
        self._person_registry = person_registry
        db.DB_FILE = self._root / "patrol_test.db"
        db.DATA_DIR = self._root
        identity_store.BINDINGS_FILE = self._root / "patrol_identity_bindings.json"
        identity_store._state = None
        person_registry.REGISTRY_FILE = self._root / "person_identity_registry.json"
        person_registry._state = None
        identity_store.BINDINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
        person_registry.REGISTRY_FILE.parent.mkdir(parents=True, exist_ok=True)
        identity_store.BINDINGS_FILE.write_text(
            '{"version":1,"by_gallery_worker":{},"alias_to_gallery":{}}',
            encoding="utf-8",
        )
        person_registry.REGISTRY_FILE.write_text(
            '{"next_seq":1,"tracks":{},"track_meta":{}}',
            encoding="utf-8",
        )
        db.close()
        db.get_conn()
        reset_lifecycle()

    def tearDown(self) -> None:
        reset_lifecycle()
        db.close()
        db.DB_FILE = self._old_db
        db.DATA_DIR = self._old_data
        self._identity_store.BINDINGS_FILE = self._old_bindings
        self._identity_store._state = None
        self._person_registry.REGISTRY_FILE = self._old_registry
        self._person_registry._state = None
        self._tmpdir.cleanup()

    def test_stale_gallery_id_is_not_active_gallery(self) -> None:
        wid = patrol_gallery_worker_id("SGC-6688")
        self.assertFalse(is_patrol_gallery_id(wid))
        self.assertEqual(patrol_tier_label(wid), "person")
        self.assertEqual(tier_for_worker_id(wid), TIER_PERSON)
        self.assertEqual(resolve_patrol_worker_display_name(wid, ""), "Người")

    def test_purge_person_gallery_assets_downgrades_live_track(self) -> None:
        # `sgc-*` là tiền tố nội bộ cho mã tạm, schema cấm dùng làm mã nhân sự.
        code = "NV6688"
        row = identity.import_identity(
            full_name="Duncan",
            employee_code=code,
            contractor="SGC",
            source="self_enroll",
        )
        pers_id = str(row["pers_id"])
        wid = patrol_gallery_worker_id(code)
        sgc = "sgc-00000042"

        bind_patrol_identity(
            gallery_worker_id=wid,
            worker_name="Duncan",
            employee_code=code,
            contractor_name="SGC",
            alias_keys=[wid, sgc, pers_id],
        )
        bind_patrol_track_identity("HC-02", "ptk-001", wid)

        # Quan sát cùng mốc thời gian bị khử trùng nên phải bước thời gian ra.
        for i in range(3):
            observe(
                "HC-02", "ptk-001", worker_id=wid, worker_name="Duncan", now=float(i + 1),
            )
        self.assertEqual(
            observe(
                "HC-02", "ptk-001", worker_id=wid, worker_name="Duncan", now=4.0,
            ).tier,
            TIER_IDENTITY,
        )

        with patch("app.worker_identity.recognizer.reload_gallery", return_value={}):
            with patch("app.patrol.enroll_images.remove_gallery_worker_faces", return_value=0):
                with patch(
                    "app.worker_identity.gallery.remove_gallery_worker_registry",
                    return_value=True,
                ):
                    identity._purge_person_gallery_assets(
                        {"pers_id": pers_id, "employee_code": code},
                    )

        self.assertFalse(is_patrol_gallery_id(wid))
        # `sgc-*` là dạng cũ, registry trả về mã tk-* chuẩn hoá cùng số.
        self.assertEqual(
            peek_patrol_track_identity("HC-02", "ptk-001"), normalize_track_id(sgc),
        )

        downgraded = observe(
            "HC-02",
            "ptk-001",
            worker_id=sgc,
            worker_name="Người",
            now=5.0,
        )
        self.assertEqual(downgraded.tier, TIER_PERSON)
        self.assertEqual(downgraded.worker_id, normalize_track_id(sgc))
        self.assertEqual(downgraded.worker_name, "Người")

    def test_revoke_gallery_worker_clears_identity_state(self) -> None:
        wid = patrol_gallery_worker_id("NV01")
        sgc = "sgc-00000099"
        # Binding không tự cấp tier Định danh — phải có hồ sơ HR identified.
        identity.import_identity(
            full_name="An",
            employee_code="NV01",
            contractor="SGC",
            source="self_enroll",
        )
        bind_patrol_identity(
            gallery_worker_id=wid,
            worker_name="An",
            employee_code="NV01",
            contractor_name="SGC",
            alias_keys=[wid, sgc],
        )
        for i in range(3):
            observe("HC-01", "ptk-77", worker_id=wid, worker_name="An", now=float(i + 1))
        self.assertEqual(
            observe("HC-01", "ptk-77", worker_id=wid, worker_name="An", now=4.0).tier,
            TIER_IDENTITY,
        )

        purge_gallery_worker_from_registry(wid, [wid, sgc])
        changed = revoke_gallery_worker(wid, [wid, sgc])
        self.assertGreaterEqual(changed, 1)

        result = observe("HC-01", "ptk-77", worker_id=sgc, worker_name="Người", now=5.0)
        self.assertEqual(result.tier, TIER_PERSON)
        self.assertEqual(result.worker_id, sgc)


if __name__ == "__main__":
    unittest.main()
