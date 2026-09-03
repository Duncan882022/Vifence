"""Cầu nối luồng AI → SQLite: Đối tượng thăng thành Người, không mất lịch sử."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import numpy as np

from app.patrol import daystore, db, identity, sink

# Đồng bộ config.py — min-commit ngắn; 2s là cửa sổ frame đẹp.
_MIN_OBJECT_COMMIT = 0.35
_FACE_CONFIRM = 0.15
_PERSON_BOX = [85.0, 62.0, 225.0, 425.0]


def _vec(seed: int, dim: int = 128) -> list[float]:
    rng = np.random.default_rng(seed)
    v = rng.normal(size=dim).astype(np.float32)
    return (v / np.linalg.norm(v)).tolist()


class PatrolSinkTests(unittest.TestCase):
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

    def test_no_face_creates_object(self) -> None:
        t0 = 1_000.0
        self.assertIsNone(
            sink.record_observation(
                camera_id="HC-01", track_id="ptk0001:person", now=t0,
            )
        )
        sink.record_observation(
            camera_id="HC-01", track_id="ptk0001:person", now=t0 + 1.0,
        )
        oid = sink.record_observation(
            camera_id="HC-01",
            track_id="ptk0001:person",
            now=t0 + _MIN_OBJECT_COMMIT,
        )
        self.assertTrue(str(oid).startswith("obj-"))
        self.assertEqual(len(daystore.list_objects(db.today_vn(t0))), 1)
        self.assertEqual(daystore.list_person_events(db.today_vn(t0)), [])

    def test_object_dwell_blocks_fleeting_detection(self) -> None:
        t0 = 1_000.0
        self.assertIsNone(
            sink.record_observation(
                camera_id="HC-01", track_id="ptk0001:person", now=t0,
            )
        )
        self.assertEqual(len(daystore.list_objects(db.today_vn(t0))), 0)

    def test_same_track_reuses_object(self) -> None:
        t0 = 1_000.0
        sink.record_observation(
            camera_id="HC-01", track_id="ptk0001:person", now=t0,
        )
        a = sink.record_observation(
            camera_id="HC-01", track_id="ptk0001:person", now=t0 + _MIN_OBJECT_COMMIT,
        )
        b = sink.record_observation(
            camera_id="HC-01", track_id="ptk0001:person", now=t0 + _MIN_OBJECT_COMMIT + 7,
        )
        self.assertEqual(a, b)
        self.assertEqual(len(daystore.list_objects(db.today_vn(t0))), 1)

    def test_face_promotes_object_and_keeps_history(self) -> None:
        """Quãng quan sát lúc còn là Đối tượng không được mất khi thăng tầng."""
        t0 = 1_000.0
        sink.record_observation(camera_id="HC-01", track_id="ptk0002:person", person_bbox=_PERSON_BOX, now=t0)
        pers = sink.record_observation(
            camera_id="HC-01",
            track_id="ptk0002:person",
            person_bbox=_PERSON_BOX,
            face_embedding=_vec(1),
            face_eligible=True,
            face_quality=0.9,
            now=t0 + 100.0,
        )
        self.assertTrue(str(pers).startswith("tk-"))

        date = db.today_vn(t0)
        self.assertEqual(daystore.list_objects(date), [])
        cards = daystore.list_person_events(date)
        self.assertEqual(len(cards), 1)
        self.assertEqual(cards[0]["first_seen"], t0)

    def test_turning_away_does_not_fall_back_to_object(self) -> None:
        """Đã thấy mặt rồi thì quay lưng một lúc vẫn là Người, không tụt hạng."""
        t0 = 1_000.0
        sink.record_observation(
            camera_id="HC-01",
            track_id="ptk0003:person",
            person_bbox=_PERSON_BOX,
            face_embedding=_vec(2),
            face_eligible=True,
            face_quality=0.9,
            now=t0,
        )
        sink.record_observation(
            camera_id="HC-01",
            track_id="ptk0003:person",
            person_bbox=_PERSON_BOX,
            face_embedding=_vec(2),
            face_eligible=True,
            face_quality=0.9,
            now=t0 + _FACE_CONFIRM,
        )
        again = sink.record_observation(
            camera_id="HC-01", track_id="ptk0003:person", person_bbox=_PERSON_BOX, now=t0 + 50.0,
        )
        self.assertTrue(str(again).startswith("tk-"))
        self.assertEqual(daystore.list_objects(db.today_vn(t0)), [])

    def test_same_person_two_cameras_one_card(self) -> None:
        """Hai mũ gặp cùng một người: một thẻ, lịch sử tách theo camera."""
        t0 = 1_000.0
        sink.record_observation(
            camera_id="HC-01",
            track_id="ptk0001:person",
            person_bbox=_PERSON_BOX,
            face_embedding=_vec(5),
            face_eligible=True,
            face_quality=0.9,
            now=t0,
        )
        a = sink.record_observation(
            camera_id="HC-01",
            track_id="ptk0001:person",
            person_bbox=_PERSON_BOX,
            face_embedding=_vec(5),
            face_eligible=True,
            face_quality=0.9,
            now=t0 + _FACE_CONFIRM,
        )
        sink.record_observation(
            camera_id="HC-02",
            track_id="ptk0009:person",
            person_bbox=_PERSON_BOX,
            face_embedding=_vec(5),
            face_eligible=True,
            face_quality=0.9,
            now=2_000.0,
        )
        b = sink.record_observation(
            camera_id="HC-02",
            track_id="ptk0009:person",
            person_bbox=_PERSON_BOX,
            face_embedding=_vec(5),
            face_eligible=True,
            face_quality=0.9,
            now=2_000.0 + _FACE_CONFIRM,
        )
        self.assertEqual(a, b)

        date = db.today_vn(t0)
        self.assertEqual(len(daystore.list_person_events(date)), 1)
        hist = daystore.list_appearances(str(a), date)
        self.assertEqual(sorted(hist["by_camera"]), ["HC-01", "HC-02"])

    def test_reencounter_updates_time_not_new_card(self) -> None:
        t0 = 1_000.0
        sink.record_observation(
            camera_id="HC-01",
            track_id="ptk0001:person",
            person_bbox=_PERSON_BOX,
            face_embedding=_vec(7),
            face_eligible=True,
            face_quality=0.9,
            now=t0,
        )
        pers = sink.record_observation(
            camera_id="HC-01",
            track_id="ptk0001:person",
            person_bbox=_PERSON_BOX,
            face_embedding=_vec(7),
            face_eligible=True,
            face_quality=0.9,
            now=t0 + _FACE_CONFIRM,
        )
        sink.record_observation(
            camera_id="HC-01",
            track_id="ptk0044:person",
            person_bbox=_PERSON_BOX,
            face_embedding=_vec(7),
            face_eligible=True,
            face_quality=0.9,
            now=9_000.0,
        )
        sink.record_observation(
            camera_id="HC-01",
            track_id="ptk0044:person",
            person_bbox=_PERSON_BOX,
            face_embedding=_vec(7),
            face_eligible=True,
            face_quality=0.9,
            now=9_000.0 + _FACE_CONFIRM,
        )
        sink.record_observation(
            camera_id="HC-01",
            track_id="ptk0044:person",
            person_bbox=_PERSON_BOX,
            face_embedding=_vec(7),
            face_eligible=True,
            face_quality=0.9,
            now=9_050.0,
        )
        cards = daystore.list_person_events(db.today_vn(t0))
        self.assertEqual(len(cards), 1)
        self.assertEqual(cards[0]["pers_id"], pers)
        self.assertEqual(cards[0]["last_seen"], 9_050.0)

    def test_identified_name_survives_new_track(self) -> None:
        """Gán tên rồi, hôm sau gặp lại bằng track khác vẫn ra đúng tên."""
        t0 = 1_000.0
        sink.record_observation(
            camera_id="HC-01",
            track_id="ptk0001:person",
            person_bbox=_PERSON_BOX,
            face_embedding=_vec(9),
            face_eligible=True,
            face_quality=0.9,
            now=t0,
        )
        pers = sink.record_observation(
            camera_id="HC-01",
            track_id="ptk0001:person",
            person_bbox=_PERSON_BOX,
            face_embedding=_vec(9),
            face_eligible=True,
            face_quality=0.9,
            now=t0 + _FACE_CONFIRM,
        )
        identity.identify(str(pers), full_name="Nguyễn Văn A", employee_code="NV001")
        sink.reset()  # phiên mới, track đánh số lại từ đầu

        again = sink.record_observation(
            camera_id="HC-02",
            track_id="ptk0001:person",
            person_bbox=_PERSON_BOX,
            face_embedding=_vec(9),
            face_eligible=True,
            face_quality=0.9,
            now=90_000.0,
        )
        again = sink.record_observation(
            camera_id="HC-02",
            track_id="ptk0001:person",
            person_bbox=_PERSON_BOX,
            face_embedding=_vec(9),
            face_eligible=True,
            face_quality=0.9,
            now=90_000.0 + _FACE_CONFIRM,
        )
        self.assertEqual(again, pers)
        row = identity.get_person(str(again))
        self.assertEqual(identity.display_name(row), "Nguyễn Văn A")

    def test_track_split_counts_a_new_sighting(self) -> None:
        """Track kết thúc rồi track mới xuất hiện cùng chỗ — hai lượt gặp.

        Không có khuôn mặt thì không có gì chứng minh đây vẫn là người cũ: chỗ
        vừa trống hoàn toàn có thể là người khác vừa bước vào. Đếm thành hai
        lượt là đúng nghiệp vụ — lượt gặp không phải số người.
        """
        t0 = 1_000.0
        box = [80.0, 60.0, 220.0, 420.0]
        sink.record_observation(
            camera_id="HC-01", track_id="ptk0001:person",
            person_bbox=box, now=t0,
        )
        first = sink.record_observation(
            camera_id="HC-01", track_id="ptk0001:person",
            person_bbox=box, now=t0 + _MIN_OBJECT_COMMIT,
        )
        sink.forget_track("HC-01", "ptk0001:person", now=t0 + 4.0)
        sink.record_observation(
            camera_id="HC-01", track_id="ptk0008:person",
            person_bbox=[85.0, 62.0, 225.0, 425.0], now=t0 + 5.0,
        )
        again = sink.record_observation(
            camera_id="HC-01", track_id="ptk0008:person",
            person_bbox=[85.0, 62.0, 225.0, 425.0],
            now=t0 + 5.0 + _MIN_OBJECT_COMMIT,
        )
        self.assertNotEqual(again, first)
        self.assertEqual(len(daystore.list_objects(db.today_vn(t0))), 2)

    def test_two_people_do_not_share_object_card(self) -> None:
        t0 = 1_000.0
        left = [40.0, 50.0, 160.0, 400.0]
        right = [400.0, 50.0, 540.0, 400.0]
        sink.record_observation(
            camera_id="HC-01", track_id="ptk0001:person", person_bbox=left, now=t0,
        )
        a = sink.record_observation(
            camera_id="HC-01", track_id="ptk0001:person",
            person_bbox=left, now=t0 + _MIN_OBJECT_COMMIT,
        )
        sink.record_observation(
            camera_id="HC-01", track_id="ptk0002:person", person_bbox=right, now=t0,
        )
        b = sink.record_observation(
            camera_id="HC-01", track_id="ptk0002:person",
            person_bbox=right, now=t0 + _MIN_OBJECT_COMMIT,
        )
        self.assertNotEqual(a, b)
        self.assertEqual(len(daystore.list_objects(db.today_vn(t0))), 2)

    def test_mixed_group_person_and_object_same_frame(self) -> None:
        """Một nhóm: người nhìn camera + người quay lưng — hai thẻ, hai tầng."""
        t0 = 1_000.0
        face_box = [40.0, 50.0, 160.0, 400.0]
        back_box = [400.0, 50.0, 540.0, 400.0]
        sink.record_observation(
            camera_id="HC-01", track_id="ptk0001:person",
            person_bbox=face_box, face_embedding=_vec(3), face_quality=0.9, now=t0,
            face_eligible=True,
        )
        pers = sink.record_observation(
            camera_id="HC-01", track_id="ptk0001:person",
            person_bbox=face_box, face_embedding=_vec(3), face_quality=0.9,
            face_eligible=True,
            now=t0 + _FACE_CONFIRM,
        )
        sink.record_observation(
            camera_id="HC-01", track_id="ptk0002:person",
            person_bbox=back_box, now=t0,
        )
        obj = sink.record_observation(
            camera_id="HC-01", track_id="ptk0002:person",
            person_bbox=back_box, now=t0 + _MIN_OBJECT_COMMIT,
        )
        self.assertTrue(str(pers).startswith("tk-"))
        self.assertTrue(str(obj).startswith("obj-"))
        self.assertNotEqual(pers, obj)
        self.assertEqual(len(daystore.list_person_events(db.today_vn(t0))), 1)
        self.assertEqual(len(daystore.list_objects(db.today_vn(t0))), 1)

    def test_person_turning_away_does_not_become_new_object(self) -> None:
        """Đã là Người, track tách khi quay lưng — vẫn Người, không đẻ Đối tượng."""
        t0 = 1_000.0
        box = [80.0, 60.0, 220.0, 420.0]
        sink.record_observation(
            camera_id="HC-01", track_id="ptk0001:person",
            person_bbox=box, face_embedding=_vec(4), face_quality=0.9, now=t0,
            face_eligible=True,
        )
        pers = sink.record_observation(
            camera_id="HC-01", track_id="ptk0001:person",
            person_bbox=box, face_embedding=_vec(4), face_quality=0.9,
            face_eligible=True,
            now=t0 + _FACE_CONFIRM,
        )
        sink.forget_track("HC-01", "ptk0001:person", now=t0 + 4.0)
        sink.record_observation(
            camera_id="HC-01", track_id="ptk0009:person",
            person_bbox=[82.0, 61.0, 218.0, 418.0], now=t0 + 5.0,
        )
        again = sink.record_observation(
            camera_id="HC-01", track_id="ptk0009:person",
            person_bbox=[82.0, 61.0, 218.0, 418.0],
            now=t0 + 5.0 + _MIN_OBJECT_COMMIT,
        )
        self.assertEqual(again, pers)
        self.assertEqual(daystore.list_objects(db.today_vn(t0)), [])

    def test_gallery_match_promotes_day_event_to_identified(self) -> None:
        """Gallery p-DUNCAN + hồ sơ HR import → thẻ tab Định danh."""
        from unittest.mock import patch

        identity.import_identity(
            full_name="Duncan",
            employee_code="DUNCAN",
            contractor="SGC",
            source="hr_import",
        )
        bindings = {
            "version": 1,
            "by_gallery_worker": {
                "p-DUNCAN": {
                    "gallery_worker_id": "p-DUNCAN",
                    "worker_name": "Duncan",
                    "employee_code": "DUNCAN",
                    "contractor_name": "SGC",
                    "aliases": ["p-DUNCAN"],
                },
            },
            "alias_to_gallery": {"p-DUNCAN": "p-DUNCAN"},
        }
        t0 = 1_000.0
        with patch("app.patrol_identity_store._load", return_value=bindings):
            sink.record_observation(
                camera_id="HC-01",
                track_id="ptk0010:person",
                person_bbox=[40.0, 50.0, 160.0, 400.0],
                face_embedding=_vec(10),
                face_quality=0.9,
                face_eligible=True,
                now=t0,
                lifecycle_tier="identity",
                lifecycle_worker_id="p-DUNCAN",
                worker_name="Duncan",
            )
            pers = sink.record_observation(
                camera_id="HC-01",
                track_id="ptk0010:person",
                person_bbox=[40.0, 50.0, 160.0, 400.0],
                face_embedding=_vec(10),
                face_quality=0.9,
                face_eligible=True,
                now=t0 + _FACE_CONFIRM,
                lifecycle_tier="identity",
                lifecycle_worker_id="p-DUNCAN",
                worker_name="Duncan",
            )
        self.assertEqual(str(pers), "p-DUNCAN")
        person = identity.get_person(str(pers))
        self.assertIsNotNone(person)
        assert person is not None
        self.assertEqual(person["status"], identity.STATUS_IDENTIFIED)
        self.assertEqual(person["full_name"], "Duncan")
        cards = daystore.list_person_events(db.today_vn(t0))
        self.assertEqual(len(cards), 1)
        self.assertEqual(cards[0]["status"], identity.STATUS_IDENTIFIED)

    def test_gallery_binding_without_hr_stays_person(self) -> None:
        """Khớp gallery không có hồ sơ HR — không tạo Định danh ảo."""
        from unittest.mock import patch

        bindings = {
            "version": 1,
            "by_gallery_worker": {
                "p-AN": {
                    "gallery_worker_id": "p-AN",
                    "worker_name": "An",
                    "employee_code": "AN",
                    "contractor_name": "SGC",
                    "aliases": ["p-AN"],
                },
            },
            "alias_to_gallery": {"p-AN": "p-AN"},
        }
        t0 = 2_000.0
        with patch("app.patrol_identity_store._load", return_value=bindings):
            pers = sink.record_observation(
                camera_id="HC-01",
                track_id="ptk0020:person",
                person_bbox=_PERSON_BOX,
                face_embedding=_vec(20),
                face_quality=0.9,
                face_eligible=True,
                now=t0 + _FACE_CONFIRM,
                lifecycle_tier="identity",
                lifecycle_worker_id="p-AN",
                worker_name="An",
            )
        from app.patrol_ids import is_person_subject_id

        self.assertTrue(is_person_subject_id(str(pers)))
        person = identity.get_person(str(pers))
        self.assertIsNotNone(person)
        assert person is not None
        self.assertEqual(person["status"], identity.STATUS_PERSON)
        self.assertNotEqual(person.get("full_name"), "An")


if __name__ == "__main__":
    unittest.main()
