"""Vệt vuông vài chục pixel không được thành ROI hay thẻ Đối tượng.

Đo trên HC-01 thật: 11 hộp person lọt cổng ghi thẻ, 9 trong đó cao 20–29 px
(khung cao 540) với tỉ lệ cao/rộng 0.95–1.11, nằm ở nửa trên khung tức là bên
kia đường. Cắt ra xem thì chỉ là vệt mờ không nhận ra được gì. Chúng đẻ ra 95
thẻ Đối tượng so với 23 thẻ Người.
"""

from __future__ import annotations

import unittest

from app.patrol_person_visibility import (
    patrol_bbox_rejects_static_fp,
    patrol_object_commit_allowed,
    patrol_person_meets_display_gate,
    speck_person_box,
)

FW, FH = 960, 540


class SpeckBoxTests(unittest.TestCase):
    def test_real_measured_specks_are_rejected(self) -> None:
        """Đúng các hộp đo được trên máy thật."""
        for x, y, w, h in [
            (700, 74, 21, 20),
            (705, 73, 20, 21),
            (710, 73, 19, 21),
            (690, 78, 24, 23),
            (688, 77, 24, 25),
            (680, 76, 27, 29),
        ]:
            box = (float(x), float(y), float(x + w), float(y + h))
            with self.subTest(box=box):
                self.assertTrue(speck_person_box(box, FW, FH))
                self.assertFalse(patrol_person_meets_display_gate(box, FW, FH))
                self.assertFalse(patrol_object_commit_allowed(box, FW, FH))

    def test_distant_but_person_shaped_box_survives(self) -> None:
        """Người thật ở xa vẫn cao gấp đôi bề rộng — không được loại."""
        box = (700.0, 74.0, 700.0 + 12.0, 74.0 + 30.0)
        self.assertFalse(speck_person_box(box, FW, FH))

    def test_close_person_survives(self) -> None:
        box = (300.0, 75.0, 300.0 + 161.0, 75.0 + 308.0)
        self.assertFalse(speck_person_box(box, FW, FH))
        self.assertTrue(patrol_person_meets_display_gate(box, FW, FH))

    def test_site_frame_workers_survive(self) -> None:
        """Người trên ảnh công trường mẫu — cao 80 px và 132 px trong khung 658."""
        for h in (80.0, 132.0):
            box = (400.0, 500.0, 400.0 + 50.0, 500.0 + h)
            with self.subTest(h=h):
                self.assertFalse(speck_person_box(box, 1290, 658))

    def test_square_box_large_enough_is_not_a_speck(self) -> None:
        """Cận thân trên vốn gần vuông — chỉ loại khi vừa nhỏ vừa vuông."""
        box = (300.0, 200.0, 300.0 + 150.0, 200.0 + 150.0)
        self.assertFalse(speck_person_box(box, FW, FH))

    def test_flycam_keeps_small_boxes(self) -> None:
        """Nhìn từ drone người thật vốn nhỏ và bẹt — gate này không được áp.

        Chỉ xét gate vẽ ROI: cùng hộp này bị gate ghi thẻ loại từ trước bởi
        `background_clutter_person_box` (aspect 0.42), không liên quan tới đây.
        """
        tiny = (FW * 0.49, FH * 0.40, FW * 0.51, FH * 0.415)
        self.assertTrue(speck_person_box(tiny, FW, FH))
        self.assertTrue(patrol_person_meets_display_gate(tiny, FW, FH, flycam=True))

    def test_ground_level_speck_would_pass_without_the_gate(self) -> None:
        """Chứng minh cổng này là thứ duy nhất chặn — không phải luật có sẵn nào."""
        box = (700.0, 74.0, 721.0, 94.0)
        self.assertFalse(patrol_bbox_rejects_static_fp(box, FW, FH))
        self.assertTrue(speck_person_box(box, FW, FH))


if __name__ == "__main__":
    unittest.main()
