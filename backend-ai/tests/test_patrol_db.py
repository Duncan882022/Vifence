"""Tầng dữ liệu Module 05 — persons / daily_events / appearances."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import numpy as np

from app.patrol import db, daystore, identity


def _vec(seed: int, dim: int = 128) -> list[float]:
    rng = np.random.default_rng(seed)
    v = rng.normal(size=dim).astype(np.float32)
    return (v / np.linalg.norm(v)).tolist()


def _nudge(vec: list[float], cosine: float, seed: int = 99) -> list[float]:
    """Cùng khuôn mặt góc khác — dựng vector lệch đúng một góc cosine cho trước.

    Cộng nhiễu theo biên độ tuyệt đối thì không kiểm soát được: nhiễu 0.15 mỗi
    chiều trên 128 chiều có chuẩn ~1.7, át hẳn vector đơn vị gốc.
    """
    rng = np.random.default_rng(seed)
    base = np.asarray(vec, dtype=np.float32)
    noise = rng.normal(size=len(vec)).astype(np.float32)
    noise -= base * float(np.dot(noise, base))
    noise /= np.linalg.norm(noise)
    v = base * cosine + noise * float(np.sqrt(1.0 - cosine**2))
    return (v / np.linalg.norm(v)).tolist()


class PatrolDbTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        db.close()
        db.DATA_DIR = Path(self._tmp.name)
        db.DB_FILE = Path(self._tmp.name) / "patrol.db"
        db.get_conn()

    def tearDown(self) -> None:
        db.close()
        self._tmp.cleanup()


class IdentityTests(PatrolDbTestCase):
    def test_new_face_gets_pers_code(self) -> None:
        pers_id, created = identity.observe_face(_vec(1), quality=0.8)
        self.assertTrue(created)
        self.assertTrue(pers_id.startswith("pers-"))
        self.assertEqual(identity.get_person(pers_id)["status"], "person")

    def test_same_face_reuses_code(self) -> None:
        first, _ = identity.observe_face(_vec(2), quality=0.8)
        again, created = identity.observe_face(_nudge(_vec(2), 0.80), quality=0.8)
        self.assertFalse(created)
        self.assertEqual(first, again)

    def test_face_below_threshold_gets_new_code(self) -> None:
        """Ngưỡng đặt chặt là chủ ý: thà cấp trùng mã còn hơn nhập nhầm hai người."""
        first, _ = identity.observe_face(_vec(50), quality=0.8)
        other, created = identity.observe_face(_nudge(_vec(50), 0.40), quality=0.8)
        self.assertTrue(created)
        self.assertNotEqual(first, other)

    def test_different_faces_get_different_codes(self) -> None:
        a, _ = identity.observe_face(_vec(3), quality=0.8)
        b, _ = identity.observe_face(_vec(4), quality=0.8)
        self.assertNotEqual(a, b)

    def test_identify_promotes_and_issues_iden_code(self) -> None:
        pers_id, _ = identity.observe_face(_vec(5), quality=0.9)
        row = identity.identify(
            pers_id, full_name="Nguyễn Văn A", employee_code="NV001"
        )
        self.assertEqual(row["status"], "identified")
        self.assertTrue(str(row["iden_code"]).startswith("iden-"))
        self.assertEqual(row["full_name"], "Nguyễn Văn A")
        # Mã người giữ nguyên — định danh là trạng thái, không phải thực thể mới.
        self.assertEqual(row["pers_id"], pers_id)

    def test_identified_row_must_have_iden_code(self) -> None:
        """Ràng buộc CHECK chặn trạng thái nửa vời ngay ở tầng lưu trữ."""
        pers_id, _ = identity.observe_face(_vec(6), quality=0.8)
        with self.assertRaises(Exception):
            with db.tx() as conn:
                conn.execute(
                    "UPDATE persons SET status = 'identified' WHERE pers_id = ?",
                    (pers_id,),
                )

    def test_display_name_follows_status(self) -> None:
        pers_id, _ = identity.observe_face(_vec(7), quality=0.8)
        self.assertEqual(identity.display_name(identity.get_person(pers_id)), pers_id)
        identity.identify(pers_id, full_name="Trần B", employee_code="NV002")
        self.assertEqual(identity.display_name(identity.get_person(pers_id)), "Trần B")


class MergeTests(PatrolDbTestCase):
    def test_same_employee_code_merges_two_codes(self) -> None:
        """Góc nghiêng làm tuột ngưỡng → hai mã cho một người. Gán tên phải gộp."""
        a, _ = identity.observe_face(_vec(10), quality=0.8)
        b, _ = identity.observe_face(_vec(11), quality=0.8)
        self.assertNotEqual(a, b)

        identity.identify(a, full_name="Lê C", employee_code="NV010")
        identity.identify(b, full_name="Lê C", employee_code="NV010")

        rows = identity.list_persons()
        self.assertEqual(len(rows), 1)
        # Mã cũ vẫn tra ra đúng người, không vỡ lịch sử.
        self.assertEqual(identity.get_person(b)["pers_id"], a)

    def test_merge_folds_faces_together(self) -> None:
        a, _ = identity.observe_face(_vec(12), quality=0.8)
        b, _ = identity.observe_face(_vec(13), quality=0.8)
        identity.merge_persons(a, b)
        faces = db.query("SELECT pers_id FROM person_faces")
        self.assertTrue(all(r["pers_id"] == a for r in faces))
        self.assertEqual(len(faces), 2)

    def test_merge_folds_same_day_cards(self) -> None:
        a, _ = identity.observe_face(_vec(14), quality=0.8)
        b, _ = identity.observe_face(_vec(15), quality=0.8)
        daystore.touch_person_event(a, camera_id="HC-01", now=1000.0)
        daystore.touch_person_event(b, camera_id="HC-02", now=2000.0)

        identity.merge_persons(a, b)
        cards = daystore.list_person_events(db.today_vn(1000.0))
        self.assertEqual(len(cards), 1)
        self.assertEqual(cards[0]["first_seen"], 1000.0)
        self.assertEqual(cards[0]["last_seen"], 2000.0)


class DailyEventTests(PatrolDbTestCase):
    def test_one_card_per_person_per_day(self) -> None:
        pers_id, _ = identity.observe_face(_vec(20), quality=0.8)
        for t in (100.0, 200.0, 300.0):
            daystore.touch_person_event(pers_id, camera_id="HC-01", now=t)

        cards = daystore.list_person_events(db.today_vn(100.0))
        self.assertEqual(len(cards), 1)
        self.assertEqual(cards[0]["first_seen"], 100.0)
        self.assertEqual(cards[0]["last_seen"], 300.0)

    def test_reencounter_updates_time_not_new_card(self) -> None:
        pers_id, _ = identity.observe_face(_vec(21), quality=0.8)
        daystore.touch_person_event(pers_id, camera_id="HC-01", now=1_000.0)
        daystore.touch_person_event(pers_id, camera_id="HC-02", now=9_000.0)

        cards = daystore.list_person_events(db.today_vn(1_000.0))
        self.assertEqual(len(cards), 1)
        self.assertEqual(cards[0]["last_seen"], 9_000.0)

        # Nhưng lịch sử phải ghi cả hai lượt, tách theo camera.
        hist = daystore.list_appearances(pers_id, db.today_vn(1_000.0))
        self.assertEqual(sorted(hist["by_camera"]), ["HC-01", "HC-02"])

    def test_card_moves_tab_when_identified(self) -> None:
        pers_id, _ = identity.observe_face(_vec(22), quality=0.8)
        daystore.touch_person_event(pers_id, camera_id="HC-01", now=500.0)
        date = db.today_vn(500.0)

        self.assertEqual(daystore.list_person_events(date)[0]["status"], "person")
        identity.identify(pers_id, full_name="Phạm D", employee_code="NV020")
        # Thẻ cũ đổi theo — tầng suy từ persons lúc truy vấn, không chụp lại.
        card = daystore.list_person_events(date)[0]
        self.assertEqual(card["status"], "identified")
        self.assertEqual(card["full_name"], "Phạm D")

    def test_appearance_segments_split_on_long_gap(self) -> None:
        pers_id, _ = identity.observe_face(_vec(23), quality=0.8)
        daystore.touch_person_event(pers_id, camera_id="HC-01", now=1_000.0)
        daystore.touch_person_event(pers_id, camera_id="HC-01", now=1_010.0)
        daystore.touch_person_event(pers_id, camera_id="HC-01", now=5_000.0)

        hist = daystore.list_appearances(pers_id, db.today_vn(1_000.0))
        self.assertEqual(len(hist["by_camera"]["HC-01"]), 2)

    def test_better_snapshot_wins_over_newer(self) -> None:
        pers_id, _ = identity.observe_face(_vec(24), quality=0.8)
        daystore.touch_person_event(
            pers_id, camera_id="HC-01", snapshot_path="rõ.jpg",
            snapshot_score=0.9, now=100.0,
        )
        daystore.touch_person_event(
            pers_id, camera_id="HC-01", snapshot_path="lưng.jpg",
            snapshot_score=0.2, now=200.0,
        )
        card = daystore.list_person_events(db.today_vn(100.0))[0]
        self.assertEqual(card["snapshot_path"], "rõ.jpg")
        self.assertEqual(card["last_seen"], 200.0)


class ObjectTests(PatrolDbTestCase):
    def test_object_gets_day_scoped_code(self) -> None:
        obj_id = daystore.touch_object(None, camera_id="HC-01", now=1_000.0)
        self.assertTrue(obj_id.startswith("obj-"))
        self.assertEqual(len(daystore.list_objects(db.today_vn(1_000.0))), 1)

    def test_continuous_stream_does_not_rewrite_every_frame(self) -> None:
        """Camera quay liên tục: đứng yên vài giây không đụng last_seen."""
        obj_id = daystore.touch_object(None, camera_id="HC-01", now=1_000.0)
        daystore.touch_object(obj_id, camera_id="HC-01", now=1_005.0)
        card = daystore.list_objects(db.today_vn(1_000.0))[0]
        self.assertEqual(card["last_seen"], 1_000.0)

        daystore.touch_object(obj_id, camera_id="HC-01", now=1_010.0)
        card = daystore.list_objects(db.today_vn(1_000.0))[0]
        self.assertEqual(card["last_seen"], 1_010.0)

    def test_better_snapshot_bypasses_presence_throttle(self) -> None:
        obj_id = daystore.touch_object(
            None, camera_id="HC-01", snapshot_path="a.jpg",
            snapshot_score=0.1, now=1_000.0,
        )
        daystore.touch_object(
            obj_id, camera_id="HC-01", snapshot_path="b.jpg",
            snapshot_score=0.8, now=1_002.0,
        )
        card = daystore.list_objects(db.today_vn(1_000.0))[0]
        self.assertEqual(card["snapshot_path"], "b.jpg")
        self.assertEqual(card["last_seen"], 1_002.0)

    def test_promote_moves_history_to_person(self) -> None:
        obj_id = daystore.touch_object(None, camera_id="HC-01", now=1_000.0)
        pers_id, _ = identity.observe_face(_vec(30), quality=0.8)
        daystore.promote_object(obj_id, pers_id, now=1_100.0)

        date = db.today_vn(1_000.0)
        self.assertEqual(daystore.list_objects(date), [])
        cards = daystore.list_person_events(date)
        self.assertEqual(len(cards), 1)
        # Quãng thời gian quan sát lúc còn là Đối tượng không bị mất.
        self.assertEqual(cards[0]["first_seen"], 1_000.0)
        hist = daystore.list_appearances(pers_id, date)
        self.assertEqual(len(hist["segments"]), 1)

    def test_promote_merges_into_existing_card(self) -> None:
        """Người đã có thẻ hôm nay: Đối tượng phải gộp vào, không đẻ thẻ mới."""
        pers_id, _ = identity.observe_face(_vec(31), quality=0.8)
        daystore.touch_person_event(pers_id, camera_id="HC-02", now=500.0)
        obj_id = daystore.touch_object(None, camera_id="HC-01", now=1_000.0)
        daystore.promote_object(obj_id, pers_id, now=1_100.0)

        date = db.today_vn(500.0)
        cards = daystore.list_person_events(date)
        self.assertEqual(len(cards), 1)
        self.assertEqual(cards[0]["first_seen"], 500.0)

    def test_purge_removes_yesterday_objects_only(self) -> None:
        yesterday = 1_700_000_000.0
        today = yesterday + 86_400 * 2
        daystore.touch_object(None, camera_id="HC-01", now=yesterday)
        pers_id, _ = identity.observe_face(_vec(32), quality=0.8)
        daystore.touch_person_event(pers_id, camera_id="HC-01", now=yesterday)

        db.purge_old_days(db.today_vn(today))

        self.assertEqual(daystore.list_objects(db.today_vn(yesterday)), [])
        # Người là thực thể bền — thẻ cũ vẫn còn để tra lịch sử.
        self.assertEqual(len(daystore.list_person_events(db.today_vn(yesterday))), 1)
        self.assertIsNotNone(identity.get_person(pers_id))


class ResetTests(PatrolDbTestCase):
    def test_reset_keeps_counters_so_codes_never_repeat(self) -> None:
        first, _ = identity.observe_face(_vec(40), quality=0.8)
        db.reset_all()
        second, _ = identity.observe_face(_vec(41), quality=0.8)
        self.assertNotEqual(first, second)
        self.assertEqual(len(identity.list_persons()), 1)


class PurgeDayTests(PatrolDbTestCase):
    def test_purge_day_clears_events_keeps_identified_profile(self) -> None:
        profile = identity.import_identity(
            full_name="Nguyễn Hồ Sơ",
            employee_code="NV999",
            contractor="Cty A",
            embedding=_vec(50),
        )
        stray, _ = identity.observe_face(_vec(51), quality=0.8)
        daystore.touch_person_event(stray, camera_id="HC-01", now=1_000.0)
        daystore.touch_object(None, camera_id="HC-01", now=1_000.0)
        date = db.today_vn(1_000.0)

        stats = db.purge_day(date)
        self.assertEqual(stats["daily_events"], 1)
        self.assertEqual(stats["daily_objects"], 1)
        self.assertEqual(stats["orphan_persons"], 1)
        self.assertEqual(daystore.list_person_events(date), [])
        self.assertEqual(daystore.list_objects(date), [])

        kept = identity.get_person(str(profile["pers_id"]))
        self.assertIsNotNone(kept)
        self.assertEqual(kept["status"], identity.STATUS_IDENTIFIED)
        self.assertEqual(kept["full_name"], "Nguyễn Hồ Sơ")
        self.assertIsNone(identity.get_person(stray))


if __name__ == "__main__":
    unittest.main()
