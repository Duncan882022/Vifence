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
    def test_new_face_gets_tk_code(self) -> None:
        pers_id, created = identity.observe_face(_vec(1), quality=0.8)
        self.assertTrue(created)
        self.assertTrue(pers_id.startswith("tk-"))
        self.assertEqual(identity.get_person(pers_id)["status"], identity.STATUS_DRAFT)

    def test_preferred_tk_reuses_registry_code(self) -> None:
        """ROI tk registry — không cấp tk mới khi observe_face có preferred_tk."""
        pers_id, created = identity.observe_face(
            _vec(55),
            quality=0.8,
            preferred_tk="tk-0000042",
        )
        self.assertTrue(created)
        self.assertEqual(pers_id, "tk-0000042")
        again, created2 = identity.observe_face(
            _nudge(_vec(55), 0.85),
            quality=0.8,
            preferred_tk="tk-0000042",
        )
        self.assertFalse(created2)
        self.assertEqual(again, "tk-0000042")
        bound = identity.lookup_bound_profile_for_tk("tk-0000042")
        self.assertEqual(bound, "tk-0000042")

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

    def test_identify_promotes_to_identified(self) -> None:
        pers_id, _ = identity.observe_face(_vec(5), quality=0.9)
        row = identity.identify(
            pers_id, full_name="Nguyễn Văn A", employee_code="NV001"
        )
        self.assertEqual(row["status"], identity.STATUS_IDENTIFIED)
        self.assertEqual(row["employee_code"], "NV001")
        self.assertEqual(row["full_name"], "Nguyễn Văn A")
        # Mã người giữ nguyên — định danh là trạng thái, không phải thực thể mới.
        self.assertEqual(row["pers_id"], pers_id)

    def test_identified_row_must_have_employee_code(self) -> None:
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
        daystore.touch_person_event(a, camera_id="HC-01", now=1000.0,
            snapshot_path="a.jpg", snapshot_score=1.2, face_eligible=True)
        daystore.touch_person_event(b, camera_id="HC-02", now=2000.0,
            snapshot_path="b.jpg", snapshot_score=1.2, face_eligible=True)

        identity.merge_persons(a, b)
        cards = daystore.list_person_events(db.today_vn(1000.0))
        self.assertEqual(len(cards), 1)
        self.assertEqual(cards[0]["first_seen"], 1000.0)
        self.assertEqual(cards[0]["last_seen"], 2000.0)

    def test_merge_renumbers_presence_seq(self) -> None:
        """Gộp hai người: hai chuỗi "lượt 1, 2..." dồn vào một, phải đánh số lại."""
        a, _ = identity.observe_face(_vec(16), quality=0.8)
        b, _ = identity.observe_face(_vec(17), quality=0.8)
        # Hai camera khác nhau để lượt gặp không bị coalesce gộp thành một dòng.
        daystore.touch_person_event(a, camera_id="HC-01", now=1_000.0,
            snapshot_path="a.jpg", snapshot_score=1.2, face_eligible=True)
        daystore.touch_person_event(b, camera_id="HC-02", now=9_000.0,
            snapshot_path="b.jpg", snapshot_score=1.2, face_eligible=True)

        date = db.today_vn(1_000.0)
        identity.merge_persons(a, b)
        segments = daystore.list_appearances(a, date)["segments"]
        self.assertEqual(len(segments), 2)
        self.assertEqual([int(s["presence_seq"]) for s in segments], [1, 2])


class DailyEventTests(PatrolDbTestCase):
    def test_one_card_per_person_per_day(self) -> None:
        pers_id, _ = identity.observe_face(_vec(20), quality=0.8)
        for t in (100.0, 200.0, 300.0):
            _touch_person_card(pers_id, camera_id="HC-01", now=t)

        cards = daystore.list_person_events(db.today_vn(100.0))
        self.assertEqual(len(cards), 1)
        self.assertEqual(cards[0]["first_seen"], 100.0)
        self.assertEqual(cards[0]["last_seen"], 300.0)

    def test_reencounter_updates_time_not_new_card(self) -> None:
        pers_id, _ = identity.observe_face(_vec(21), quality=0.8)
        _touch_person_card(pers_id, camera_id="HC-01", now=1_000.0)
        _touch_person_card(pers_id, camera_id="HC-02", now=9_000.0)

        cards = daystore.list_person_events(db.today_vn(1_000.0))
        self.assertEqual(len(cards), 1)
        self.assertEqual(cards[0]["last_seen"], 9_000.0)

        # Nhưng lịch sử phải ghi cả hai lượt, tách theo camera.
        hist = daystore.list_appearances(pers_id, db.today_vn(1_000.0))
        self.assertEqual(sorted(hist["by_camera"]), ["HC-01", "HC-02"])

    def test_card_moves_tab_when_identified(self) -> None:
        pers_id, _ = identity.observe_face(_vec(22), quality=0.8)
        _touch_person_card(pers_id, camera_id="HC-01", now=500.0)
        date = db.today_vn(500.0)

        self.assertEqual(daystore.list_person_events(date)[0]["status"], identity.STATUS_DRAFT)
        identity.identify(pers_id, full_name="Phạm D", employee_code="NV020")
        # Thẻ cũ đổi theo — tầng suy từ persons lúc truy vấn, không chụp lại.
        card = daystore.list_person_events(date)[0]
        self.assertEqual(card["status"], "identified")
        self.assertEqual(card["full_name"], "Phạm D")

    def test_appearance_segments_split_on_long_gap(self) -> None:
        pers_id, _ = identity.observe_face(_vec(23), quality=0.8)
        _touch_person_card(pers_id, camera_id="HC-01", now=1_000.0)
        _touch_person_card(pers_id, camera_id="HC-01", now=1_010.0)
        _touch_person_card(pers_id, camera_id="HC-01", now=5_000.0)

        hist = daystore.list_appearances(pers_id, db.today_vn(1_000.0))
        self.assertEqual(len(hist["by_camera"]["HC-01"]), 2)

    def test_appearance_stores_snapshot_path(self) -> None:
        pers_id, _ = identity.observe_face(_vec(28), quality=0.8)
        daystore.touch_person_event(
            pers_id,
            camera_id="HC-01",
            snapshot_path="20250828/pers-0001.jpg",
            snapshot_score=1.5,
            face_eligible=True,
            now=1_000.0,
        )
        hist = daystore.list_appearances(pers_id, db.today_vn(1_000.0))
        self.assertEqual(len(hist["segments"]), 1)
        self.assertEqual(hist["segments"][0]["snapshot_path"], "20250828/pers-0001.jpg")

    def test_better_snapshot_wins_over_newer(self) -> None:
        pers_id, _ = identity.observe_face(_vec(24), quality=0.8)
        daystore.touch_person_event(
            pers_id, camera_id="HC-01", snapshot_path="rõ.jpg",
            snapshot_score=1.2, face_eligible=True, now=100.0,
        )
        daystore.touch_person_event(
            pers_id, camera_id="HC-01", snapshot_path="lưng.jpg",
            snapshot_score=0.2, face_eligible=True, now=200.0,
        )
        card = daystore.list_person_events(db.today_vn(100.0))[0]
        self.assertEqual(card["snapshot_path"], "rõ.jpg")
        self.assertEqual(card["last_seen"], 200.0)

    def test_no_snapshot_without_face_eligible(self) -> None:
        pers_id, _ = identity.observe_face(_vec(25), quality=0.8)
        daystore.touch_person_event(
            pers_id, camera_id="HC-01", snapshot_path="mặt.jpg",
            snapshot_score=1.8, face_eligible=True, now=100.0,
        )
        daystore.touch_person_event(
            pers_id, camera_id="HC-01", snapshot_path="lưng.jpg",
            snapshot_score=0.9, face_eligible=False, now=110.0,
        )
        card = daystore.list_person_events(db.today_vn(100.0))[0]
        self.assertEqual(card["snapshot_path"], "mặt.jpg")
        self.assertEqual(card["last_seen"], 110.0)

    def test_person_card_created_without_face_snapshot(self) -> None:
        """Aggregator có thể chốt pers trước khi có ảnh — vẫn phải có thẻ tab Người."""
        pers_id, _ = identity.observe_face(_vec(25), quality=0.8)
        daystore.touch_person_event(
            pers_id, camera_id="HC-01", now=500.0, face_eligible=False,
        )
        cards = daystore.list_person_events(db.today_vn(500.0))
        self.assertEqual(len(cards), 1)
        self.assertIsNone(cards[0]["snapshot_path"])

    def test_identified_prefers_latest_face_over_best_of(self) -> None:
        pers_id, _ = identity.observe_face(_vec(26), quality=0.8)
        identity.identify(pers_id, full_name="An", employee_code="NV26")
        floor = daystore._person_snapshot_score_floor()
        strong = floor + 0.6
        decent = floor + 0.05
        daystore.touch_person_event(
            pers_id, camera_id="HC-01", snapshot_path="best.jpg",
            snapshot_score=strong, face_eligible=True, now=1_000.0,
        )
        daystore.touch_person_event(
            pers_id, camera_id="HC-01", snapshot_path="recent.jpg",
            snapshot_score=decent, face_eligible=True, now=1_005.0,
        )
        card = daystore.list_person_events(db.today_vn(1_000.0))[0]
        self.assertEqual(card["snapshot_path"], "recent.jpg")

    def test_identified_immediate_upsert_when_face_clearer(self) -> None:
        """Định danh cũng upsert ngay khi ảnh rõ hơn — coi như sự kiện."""
        pers_id, _ = identity.observe_face(_vec(27), quality=0.8)
        identity.identify(pers_id, full_name="Bình", employee_code="NV27")
        floor = daystore._person_snapshot_score_floor()
        daystore.touch_person_event(
            pers_id, camera_id="HC-01", snapshot_path="ok.jpg",
            snapshot_score=floor + 0.1, face_eligible=True, now=1_000.0,
        )
        daystore.touch_person_event(
            pers_id, camera_id="HC-01", snapshot_path="better.jpg",
            snapshot_score=floor + 0.5, face_eligible=True, now=1_003.0,
        )
        card = daystore.list_person_events(db.today_vn(1_000.0))[0]
        self.assertEqual(card["snapshot_path"], "better.jpg")
        self.assertEqual(card["last_seen"], 1_003.0)

    def test_appearance_extends_when_card_throttled(self) -> None:
        """Cùng lần gặp (<45s) — popup một dòng, kéo ended_at."""
        pers_id, _ = identity.observe_face(_vec(30), quality=0.8)
        daystore.touch_person_event(
            pers_id, camera_id="HC-01", snapshot_path="a.jpg",
            snapshot_score=1.2, face_eligible=True, now=1_000.0,
        )
        daystore.touch_person_event(
            pers_id, camera_id="HC-01", snapshot_path="b.jpg",
            snapshot_score=1.1, face_eligible=True, now=1_011.0,
        )
        card = daystore.list_person_events(db.today_vn(1_000.0))[0]
        self.assertEqual(card["snapshot_path"], "a.jpg")
        self.assertEqual(card["last_seen"], 1_011.0)

        hist = daystore.list_appearances(pers_id, db.today_vn(1_000.0))
        snaps = [s for s in hist["segments"] if s.get("snapshot_path")]
        self.assertEqual(len(snaps), 1)
        self.assertEqual(snaps[0]["started_at"], 1_000.0)
        self.assertEqual(snaps[0]["ended_at"], 1_011.0)
        self.assertEqual(snaps[0]["snapshot_path"], "a.jpg")

    def test_appearance_accumulates_across_encounters(self) -> None:
        """Hai lần gặp cách >45s — popup giữ 2 dòng, không đè ảnh."""
        pers_id, _ = identity.observe_face(_vec(33), quality=0.8)
        daystore.touch_person_event(
            pers_id, camera_id="HC-01", snapshot_path="enc-1.jpg",
            snapshot_score=1.2, face_eligible=True, now=3_000.0,
        )
        daystore.touch_person_event(
            pers_id, camera_id="HC-01", snapshot_path="enc-2.jpg",
            snapshot_score=1.2, face_eligible=True, now=3_100.0,
        )
        hist = daystore.list_appearances(pers_id, db.today_vn(3_000.0))
        snaps = [s for s in hist["segments"] if s.get("snapshot_path")]
        self.assertEqual(len(snaps), 2)
        self.assertEqual(snaps[0]["snapshot_path"], "enc-1.jpg")
        self.assertEqual(snaps[1]["snapshot_path"], "enc-2.jpg")

    def test_rapid_snapshot_touches_single_history_row(self) -> None:
        """6 FPS — đứng trong khung ~1s vẫn chỉ một lần gặp."""
        pers_id, _ = identity.observe_face(_vec(32), quality=0.8)
        base = 2_000.0
        for i in range(8):
            daystore.touch_person_event(
                pers_id,
                camera_id="HC-01",
                snapshot_path=f"20260829/pers-burst-{i}.jpg",
                snapshot_score=1.2,
                face_eligible=True,
                now=base + i * 0.15,
            )
        hist = daystore.list_appearances(pers_id, db.today_vn(base))
        snaps = [s for s in hist["segments"] if s.get("snapshot_path")]
        self.assertEqual(len(snaps), 1)
        self.assertEqual(snaps[0]["started_at"], base)
        self.assertAlmostEqual(snaps[0]["ended_at"], base + 7 * 0.15, places=3)
        self.assertEqual(snaps[0]["snapshot_path"], "20260829/pers-burst-0.jpg")

    def test_separate_encounters_after_gap(self) -> None:
        """Mỗi lần gặp cách >45s — popup tách dòng."""
        pers_id, _ = identity.observe_face(_vec(31), quality=0.8)
        lat, lng = 20.93309, 106.92395
        base = 1_735_000_000.0
        for i, offset in enumerate((0, 60, 120, 240)):
            daystore.touch_person_event(
                pers_id,
                camera_id="HC-02",
                snapshot_path=f"20260829/pers-snap-{i}.jpg",
                snapshot_score=1.2,
                face_eligible=True,
                now=base + offset,
                gps_lat=lat,
                gps_lng=lng,
            )
        hist = daystore.list_appearances(pers_id, db.today_vn(base))
        snaps = [s for s in hist["segments"] if s.get("snapshot_path")]
        self.assertEqual(len(snaps), 4)

    def test_appearance_keeps_snapshot_when_card_keeps_best(self) -> None:
        """Lượt mới sau gap vẫn lưu ảnh riêng dù thẻ giữ snapshot rõ hơn."""
        pers_id, _ = identity.observe_face(_vec(29), quality=0.8)
        daystore.touch_person_event(
            pers_id,
            camera_id="HC-01",
            snapshot_path="20250828/pers-0001-1000.jpg",
            snapshot_score=1.5,
            face_eligible=True,
            now=1_000.0,
        )
        daystore.touch_person_event(
            pers_id,
            camera_id="HC-01",
            snapshot_path="20250828/pers-0001-5000.jpg",
            snapshot_score=1.1,
            face_eligible=True,
            now=5_000.0,
        )
        card = daystore.list_person_events(db.today_vn(1_000.0))[0]
        self.assertEqual(card["snapshot_path"], "20250828/pers-0001-1000.jpg")

        hist = daystore.list_appearances(pers_id, db.today_vn(1_000.0))
        self.assertEqual(len(hist["segments"]), 2)
        paths = {s["snapshot_path"] for s in hist["segments"]}
        self.assertEqual(
            paths,
            {"20250828/pers-0001-1000.jpg", "20250828/pers-0001-5000.jpg"},
        )

    def test_draft_card_created_before_eligible_snapshot(self) -> None:
        """Thẻ draft có thể tạo trước khi có ảnh đủ điểm — snapshot gán sau."""
        pers_id, _ = identity.observe_face(_vec(34), quality=0.8)
        daystore.touch_person_event(pers_id, camera_id="HC-01", now=1_000.0)
        cards = daystore.list_person_events(db.today_vn(1_000.0))
        self.assertEqual(len(cards), 1)
        self.assertIsNone(cards[0]["snapshot_path"])

        _touch_person_card(pers_id, camera_id="HC-01", now=1_010.0, snapshot_path="face.jpg")
        self.assertEqual(
            daystore.list_person_events(db.today_vn(1_000.0))[0]["snapshot_path"],
            "face.jpg",
        )

    def test_new_encounter_splits_within_gap(self) -> None:
        """Track mới (seen_since) → dòng lịch sử mới dù cách <45s."""
        pers_id, _ = identity.observe_face(_vec(35), quality=0.8)
        _touch_person_card(
            pers_id, camera_id="HC-01", now=1_000.0, snapshot_path="enc-1.jpg",
        )
        _touch_person_card(
            pers_id,
            camera_id="HC-01",
            now=1_020.0,
            snapshot_path="enc-2.jpg",
            seen_since=1_020.0,
        )
        hist = daystore.list_appearances(pers_id, db.today_vn(1_000.0))
        snaps = [s for s in hist["segments"] if s.get("snapshot_path")]
        self.assertEqual(len(snaps), 2)
        self.assertEqual(snaps[0]["snapshot_path"], "enc-1.jpg")
        self.assertEqual(snaps[1]["snapshot_path"], "enc-2.jpg")


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
        _touch_person_card(pers_id, camera_id="HC-02", now=500.0)
        obj_id = daystore.touch_object(None, camera_id="HC-01", now=1_000.0)
        daystore.promote_object(obj_id, pers_id, now=1_100.0)

        date = db.today_vn(500.0)
        cards = daystore.list_person_events(date)
        self.assertEqual(len(cards), 1)
        self.assertEqual(cards[0]["first_seen"], 500.0)

    def test_promote_from_two_objects_renumbers_presence_seq(self) -> None:
        """Thăng hạng từ hai Đối tượng: hai lượt gặp phải mang số khác nhau.

        `presence_seq` đếm trong phạm vi một subject_id, nên mỗi obj tự đếm từ 1.
        Dồn cả hai sang cùng một người mà không đánh số lại thì popup hiện "lượt 1"
        hai lần. Đo trên máy thật: đúng hai subject bị trùng số là đúng hai subject
        promote từ nhiều hơn một obj.
        """
        pers_id, _ = identity.observe_face(_vec(32), quality=0.8)
        first = daystore.touch_object(None, camera_id="HC-01", now=1_000.0)
        daystore.promote_object(first, pers_id, now=1_010.0)
        second = daystore.touch_object(None, camera_id="HC-01", now=5_000.0)
        daystore.promote_object(second, pers_id, now=5_010.0)

        date = db.today_vn(1_000.0)
        segments = daystore.list_appearances(pers_id, date)["segments"]
        self.assertEqual(len(segments), 2)
        seqs = sorted(int(s["presence_seq"]) for s in segments)
        self.assertEqual(seqs, [1, 2])

    def test_renumber_presence_seq_follows_time_order(self) -> None:
        """Số lượt gặp chạy theo thời gian bắt đầu, không theo thứ tự ghi vào."""
        pers_id, _ = identity.observe_face(_vec(33), quality=0.8)
        late = daystore.touch_object(None, camera_id="HC-01", now=9_000.0)
        daystore.promote_object(late, pers_id, now=9_010.0)
        early = daystore.touch_object(None, camera_id="HC-01", now=1_000.0)
        daystore.promote_object(early, pers_id, now=1_010.0)

        date = db.today_vn(1_000.0)
        # `list_appearances` trả về đã sắp theo `started_at ASC`.
        segments = daystore.list_appearances(pers_id, date)["segments"]
        self.assertEqual([int(s["presence_seq"]) for s in segments], [1, 2])
        self.assertLess(float(segments[0]["started_at"]), float(segments[1]["started_at"]))

    def test_parallel_tracks_stay_separate_cards(self) -> None:
        """Hai track chồng giờ trên cùng camera vẫn là hai lượt gặp.

        Đối tượng không có tiêu chí định danh nên mọi phép gộp ở đây chỉ là suy
        đoán từ thời gian; gộp nhầm là mất hẳn một lượt mà không cách nào phát
        hiện về sau. Thà đếm dư còn hơn dồn nhầm hai người vào một thẻ.
        """
        a = daystore.touch_object(None, camera_id="HC-01", now=1_000.0)
        daystore.touch_object(a, camera_id="HC-01", now=1_030.0)
        b = daystore.touch_object(None, camera_id="HC-01", now=1_008.0)
        daystore.touch_object(b, camera_id="HC-01", now=1_028.0)

        date = db.today_vn(1_000.0)
        self.assertEqual(len(daystore.list_objects(date)), 2)
        self.assertNotEqual(a, b)

    def test_purge_removes_yesterday_objects_only(self) -> None:
        yesterday = 1_700_000_000.0
        today = yesterday + 86_400 * 2
        daystore.touch_object(None, camera_id="HC-01", now=yesterday)
        pers_id, _ = identity.observe_face(_vec(32), quality=0.8)
        _touch_person_card(pers_id, camera_id="HC-01", now=yesterday)

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
        _touch_person_card(stray, camera_id="HC-01", now=1_000.0)
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


class AppearanceSubjectResolveTests(PatrolDbTestCase):
    def test_gallery_alias_maps_to_pers_not_obj(self) -> None:
        from unittest.mock import patch

        from app.patrol.daystore import _resolve_appearance_subject_id

        pers_id, _ = identity.observe_face(_vec(60), quality=0.8)
        obj_id = daystore.touch_object(None, camera_id="HC-01", now=1_000.0)

        fake_row = {
            "aliases": [str(pers_id), str(obj_id), "tk-12"],
        }
        with patch("app.patrol_identity_store.lookup_patrol_identity", return_value=fake_row):
            self.assertEqual(_resolve_appearance_subject_id("p-DUNCAN"), "p-DUNCAN")
            self.assertEqual(_resolve_appearance_subject_id(str(obj_id)), str(obj_id))
            self.assertEqual(_resolve_appearance_subject_id(str(pers_id)), str(pers_id))


if __name__ == "__main__":
    unittest.main()
