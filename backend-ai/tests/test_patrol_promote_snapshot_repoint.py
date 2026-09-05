"""Ảnh đại diện của một lượt gặp khi Đối tượng thăng hạng giữa lượt.

Lịch sử cố ý đóng băng ảnh lúc bắt đầu lần gặp. Nhưng nếu `obj-*` thăng hạng
thành `tk-*` giữa lượt, tấm đóng băng là tấm mang badge "Đối tượng" — thẻ Người
mở ra thấy dòng lịch sử ghi "Đối tượng", và tấm ảnh ngoài thẻ không nằm trong
danh sách lịch sử. Đo trên máy thật sau khi wipe: 10 dòng lịch sử của thẻ Người
còn giữ ảnh `obj-*`, và 5/10 thẻ đầu có ảnh ngoài không khớp dòng nào.
"""

from __future__ import annotations

import unittest

from app.patrol.daystore import (
    _person_card_snap_from_object,
    keep_snapshot_for_luot,
)

DATE = "2026-09-04"


class KeepSnapshotForLuotTests(unittest.TestCase):
    def test_takes_person_reshoot_of_same_luot(self) -> None:
        self.assertEqual(
            keep_snapshot_for_luot(
                f"{DATE}/obj-20260904-0002-2.jpg",
                f"{DATE}/tk-0000001-2.jpg",
            ),
            f"{DATE}/tk-0000001-2.jpg",
        )

    def test_keeps_frozen_image_within_same_subject(self) -> None:
        """Trong cùng một lượt, cùng một chủ thể — ảnh vẫn đóng băng."""
        self.assertEqual(
            keep_snapshot_for_luot(
                f"{DATE}/tk-0000001-2.jpg",
                f"{DATE}/tk-0000001-2.jpg",
            ),
            f"{DATE}/tk-0000001-2.jpg",
        )

    def test_ignores_person_image_of_a_different_luot(self) -> None:
        """Lượt khác là khoảnh khắc khác — không được đè lên ảnh lượt này."""
        self.assertEqual(
            keep_snapshot_for_luot(
                f"{DATE}/obj-20260904-0002-2.jpg",
                f"{DATE}/tk-0000001-44.jpg",
            ),
            f"{DATE}/obj-20260904-0002-2.jpg",
        )

    def test_object_never_overwrites_object(self) -> None:
        self.assertEqual(
            keep_snapshot_for_luot(
                f"{DATE}/obj-20260904-0002-2.jpg",
                f"{DATE}/obj-20260904-0009-2.jpg",
            ),
            f"{DATE}/obj-20260904-0002-2.jpg",
        )

    def test_person_image_is_never_downgraded_to_object(self) -> None:
        self.assertEqual(
            keep_snapshot_for_luot(
                f"{DATE}/tk-0000001-2.jpg",
                f"{DATE}/obj-20260904-0002-2.jpg",
            ),
            f"{DATE}/tk-0000001-2.jpg",
        )

    def test_fills_empty_slot(self) -> None:
        self.assertEqual(
            keep_snapshot_for_luot(None, f"{DATE}/tk-0000001-2.jpg"),
            f"{DATE}/tk-0000001-2.jpg",
        )
        self.assertEqual(
            keep_snapshot_for_luot(f"{DATE}/tk-0000001-2.jpg", None),
            f"{DATE}/tk-0000001-2.jpg",
        )
        self.assertIsNone(keep_snapshot_for_luot(None, None))


class PersonCardSnapFromObjectTests(unittest.TestCase):
    def test_skips_obj_jpg_on_person_card(self) -> None:
        snap, score = _person_card_snap_from_object({
            "snapshot_path": f"{DATE}/obj-20260904-0007-1.jpg",
            "snapshot_score": 0.78,
        })
        self.assertIsNone(snap)
        self.assertEqual(score, 0.0)

    def test_keeps_tk_jpg(self) -> None:
        path = f"{DATE}/tk-0000071-5.jpg"
        snap, score = _person_card_snap_from_object({
            "snapshot_path": path,
            "snapshot_score": 2.1,
        })
        self.assertEqual(snap, path)
        self.assertEqual(score, 2.1)

    def test_legacy_names_without_luot_stay_frozen(self) -> None:
        """Ảnh cũ đặt tên `{subject}.jpg` không có khoá lượt — không suy đoán."""
        self.assertEqual(
            keep_snapshot_for_luot(
                f"{DATE}/obj-20260904-0002.jpg",
                f"{DATE}/tk-0000001.jpg",
            ),
            f"{DATE}/obj-20260904-0002.jpg",
        )


if __name__ == "__main__":
    unittest.main()
