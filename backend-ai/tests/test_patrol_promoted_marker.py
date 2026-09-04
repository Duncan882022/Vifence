"""Thẻ Người mang mốc "vốn là Đối tượng nào".

Người dùng không phân biệt được thẻ Người mang ảnh badge "Đối tượng" là do
thăng hạng giữa lượt hay do nhận dạng sai. Mốc này là thứ để phân biệt, dùng
cho badge trên thẻ sự kiện và dấu trên nhãn ROI camera.
"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from app.patrol import daystore, db, identity, promoted_registry


class PromotedMarkerTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        db.close()
        db.DATA_DIR = Path(self._tmp.name)
        db.DB_FILE = db.DATA_DIR / "patrol.db"
        db.get_conn()
        promoted_registry.reset()
        self.date = db.today_vn()

    def tearDown(self) -> None:
        promoted_registry.reset()
        db.close()
        self._tmp.cleanup()

    def _promote(self, obj_id: str) -> str:
        daystore.touch_object(
            obj_id,
            camera_id="HC-01",
            zone_id=None,
            now=None,
            snapshot_path=f"{self.date}/{obj_id}-1.jpg",
            snapshot_score=0.9,
            skip_appearance=True,
        )
        pid = identity.allocate_tk_profile()
        daystore.promote_object(obj_id, pid)
        return pid

    def test_card_carries_source_object(self) -> None:
        obj_id = daystore.touch_object(
            None, camera_id="HC-01", zone_id=None, now=None, skip_appearance=True,
        )
        pid = self._promote(str(obj_id))
        cards = {str(r["pers_id"]): r for r in daystore.list_person_events(self.date)}
        self.assertIn(pid, cards)
        self.assertEqual(cards[pid]["promoted_from"], [str(obj_id)])
        self.assertIsNotNone(cards[pid]["promoted_at"])

    def test_card_without_promotion_has_empty_marker(self) -> None:
        pid = identity.allocate_tk_profile()
        daystore.touch_person_event(
            pid, camera_id="HC-01", zone_id=None, now=None, skip_appearance=True,
        )
        cards = {str(r["pers_id"]): r for r in daystore.list_person_events(self.date)}
        self.assertEqual(cards[pid]["promoted_from"], [])

    def test_registry_marks_on_promote(self) -> None:
        obj_id = str(daystore.touch_object(
            None, camera_id="HC-01", zone_id=None, now=None, skip_appearance=True,
        ))
        pid = self._promote(obj_id)
        self.assertTrue(promoted_registry.was_promoted(pid, self.date))
        self.assertFalse(promoted_registry.was_promoted("tk-9999999", self.date))

    def test_registry_recovers_from_sqlite_after_restart(self) -> None:
        """Sổ trong bộ nhớ trống sau khi khởi động lại — phải nạp lại từ SQLite."""
        obj_id = str(daystore.touch_object(
            None, camera_id="HC-01", zone_id=None, now=None, skip_appearance=True,
        ))
        pid = self._promote(obj_id)
        promoted_registry.reset()
        self.assertTrue(promoted_registry.was_promoted(pid, self.date))

    def test_registry_ignores_blank(self) -> None:
        self.assertFalse(promoted_registry.was_promoted("", self.date))
        promoted_registry.mark_promoted("  ", self.date)
        self.assertFalse(promoted_registry.was_promoted("  ", self.date))


if __name__ == "__main__":
    unittest.main()
