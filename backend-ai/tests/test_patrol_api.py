"""API Module 05 — đọc/ghi SQLite qua HTTP."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import numpy as np
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.config import settings
from app.patrol import daystore, db, identity
from app.patrol.api import router


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


class PatrolApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self._prev_auth = settings.patrol_auth_disabled
        settings.patrol_auth_disabled = True
        self._tmp = tempfile.TemporaryDirectory()
        db.close()
        db.DATA_DIR = Path(self._tmp.name)
        db.DB_FILE = Path(self._tmp.name) / "patrol.db"
        db.get_conn()

        app = FastAPI()
        app.include_router(router)
        self.client = TestClient(app)

    def tearDown(self) -> None:
        settings.patrol_auth_disabled = self._prev_auth
        db.close()
        self._tmp.cleanup()

    def test_person_list_splits_by_status(self) -> None:
        a, _ = identity.observe_face(_vec(1), quality=0.8)
        b, _ = identity.observe_face(_vec(2), quality=0.8)
        identity.identify(b, full_name="Nguyễn A", employee_code="NV001")

        people = self.client.get("/patrol/persons?status=person").json()
        ids = self.client.get("/patrol/persons?status=identified").json()

        self.assertEqual([r["pers_id"] for r in people["items"]], [a])
        self.assertEqual([r["pers_id"] for r in ids["items"]], [b])
        self.assertEqual(ids["items"][0]["display_name"], "Nguyễn A")
        self.assertTrue(ids["items"][0]["iden_code"].startswith("iden-"))

    def test_identify_endpoint_promotes(self) -> None:
        pers_id, _ = identity.observe_face(_vec(3), quality=0.8)
        res = self.client.post(
            f"/patrol/persons/{pers_id}/identify",
            json={"full_name": "Trần B", "employee_code": "NV002", "contractor": "Nhà thầu X"},
        ).json()

        self.assertTrue(res["ok"])
        self.assertEqual(res["person"]["status"], "identified")
        self.assertEqual(res["person"]["display_name"], "Trần B")

    def test_identify_missing_fields_rejected(self) -> None:
        pers_id, _ = identity.observe_face(_vec(4), quality=0.8)
        res = self.client.post(
            f"/patrol/persons/{pers_id}/identify", json={"full_name": "Thiếu mã"}
        )
        self.assertEqual(res.status_code, 422)

    def test_day_events_reflect_identity_change(self) -> None:
        pers_id, _ = identity.observe_face(_vec(5), quality=0.8)
        _touch_person_card(pers_id, camera_id="HC-01")
        date = db.today_vn(1_000.0)

        before = self.client.get(f"/patrol/day/events?date={date}").json()
        self.assertEqual(before["items"][0]["status"], "person")

        self.client.post(
            f"/patrol/persons/{pers_id}/identify",
            json={"full_name": "Lê C", "employee_code": "NV003"},
        )
        after = self.client.get(f"/patrol/day/events?date={date}").json()
        self.assertEqual(after["items"][0]["status"], "identified")
        self.assertEqual(after["items"][0]["display_name"], "Lê C")

    def test_appearances_grouped_by_camera(self) -> None:
        pers_id, _ = identity.observe_face(_vec(6), quality=0.8)
        _touch_person_card(pers_id, camera_id="HC-01")
        _touch_person_card(pers_id, camera_id="DR-03")
        date = db.today_vn(1_000.0)

        res = self.client.get(
            f"/patrol/day/appearances?subject_id={pers_id}&date={date}",
        ).json()
        self.assertTrue(res["ok"])
        self.assertEqual(sorted(res["by_camera"]), ["DR-03", "HC-01"])

    def test_day_stats_and_presences(self) -> None:
        pers_id, _ = identity.observe_face(_vec(9), quality=0.8)
        _touch_person_card(
            pers_id, camera_id="HC-01", now=1_000.0,
            gps_lat=10.7721, gps_lng=106.6592,
        )
        daystore.touch_object(
            None, camera_id="HC-02", now=2_000.0,
            gps_lat=10.7725, gps_lng=106.6595,
            snapshot_path="obj.jpg",
            snapshot_score=0.6,
        )
        date = db.today_vn(1_000.0)

        stats = self.client.get(f"/patrol/day/stats?date={date}").json()
        self.assertTrue(stats["ok"])
        self.assertEqual(stats["workers_standard"], 1)
        self.assertEqual(stats["encounters_standard"], 1)
        self.assertEqual(stats["unassigned_observations"], 1)
        self.assertEqual(stats["object_card_count"], 1)
        self.assertEqual(
            stats["workers_standard"],
            stats["person_count"] + stats["identity_count"],
        )

        pres = self.client.get(f"/patrol/day/presences?date={date}").json()
        self.assertTrue(pres["ok"])
        self.assertEqual(len(pres["items"]), 2)
        gps_items = [i for i in pres["items"] if i.get("gps_lat")]
        self.assertGreaterEqual(len(gps_items), 1)

    def test_day_bundle_includes_snapshot_score(self) -> None:
        pers_id, _ = identity.observe_face(_vec(10), quality=0.8)
        _touch_person_card(
            pers_id,
            camera_id="HC-01",
            now=3_000.0,
            snapshot_path="bundle.jpg",
            snapshot_score=1.35,
        )
        date = db.today_vn(3_000.0)
        bundle = self.client.get(f"/patrol/day/bundle?date={date}").json()
        self.assertTrue(bundle["ok"])
        self.assertEqual(len(bundle["events"]), 1)
        self.assertEqual(bundle["events"][0]["snapshot_path"], "bundle.jpg")
        self.assertAlmostEqual(bundle["events"][0]["snapshot_score"], 1.35)

    def test_merge_endpoint_keeps_old_code_resolvable(self) -> None:
        a, _ = identity.observe_face(_vec(7), quality=0.8)
        b, _ = identity.observe_face(_vec(8), quality=0.8)
        res = self.client.post("/patrol/persons/merge", json={"keep": a, "drop": b}).json()
        self.assertTrue(res["ok"])

        looked_up = self.client.get(f"/patrol/persons/{b}").json()
        self.assertEqual(looked_up["person"]["pers_id"], a)

    def test_objects_listed(self) -> None:
        daystore.touch_object(None, camera_id="HC-02")
        self.assertEqual(len(self.client.get("/patrol/day/objects").json()["items"]), 1)

    def test_update_and_delete_profile(self) -> None:
        pers_id, _ = identity.observe_face(_vec(9), quality=0.8)
        identity.identify(
            pers_id, full_name="Nguyễn X", employee_code="NV010", contractor="SGC",
        )

        updated = self.client.patch(
            f"/patrol/persons/{pers_id}",
            json={
                "full_name": "Nguyễn X (sửa)",
                "employee_code": "NV010",
                "contractor": "Vincons",
            },
        ).json()
        self.assertTrue(updated["ok"])
        self.assertEqual(updated["person"]["full_name"], "Nguyễn X (sửa)")
        self.assertEqual(updated["person"]["contractor"], "Vincons")

        deleted = self.client.delete(f"/patrol/persons/{pers_id}").json()
        self.assertTrue(deleted["ok"])
        missing = self.client.get(f"/patrol/persons/{pers_id}").json()
        self.assertFalse(missing["ok"])

    def test_purge_day_events_endpoint(self) -> None:
        profile = identity.import_identity(
            full_name="Trần BC",
            employee_code="NV888",
            embedding=_vec(88),
        )
        pers, _ = identity.observe_face(_vec(89), quality=0.8)
        _touch_person_card(pers, camera_id="HC-01", now=2_000.0)
        date = db.today_vn(2_000.0)

        res = self.client.delete(f"/patrol/day/events?date={date}").json()
        self.assertTrue(res["ok"])
        self.assertEqual(res["daily_events"], 1)
        self.assertEqual(daystore.list_person_events(date), [])
        self.assertIsNotNone(identity.get_person(str(profile["pers_id"])))

    def test_public_health_and_enroll_session_without_auth(self) -> None:
        settings.patrol_auth_disabled = False
        health = self.client.get("/patrol/health").json()
        self.assertTrue(health["ok"])

        created = self.client.post("/patrol/enroll/session").json()
        self.assertTrue(created["ok"])
        session_id = created["session_id"]
        self.assertTrue(session_id)

        status = self.client.get(f"/patrol/enroll/{session_id}").json()
        self.assertTrue(status["ok"])
        self.assertEqual(status["enrollment"]["faces_captured"], 0)


if __name__ == "__main__":
    unittest.main()
