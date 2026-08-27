"""Gate vẽ ROI phải rộng hơn gate ghi sự kiện.

Yêu cầu nghiệp vụ: khoanh mọi thứ có dấu hiệu là người trên camera; ràng buộc
"đầu + 1/3 thân trên" chỉ quyết định có ghi sự kiện hay không. Bộ test này khoá
đúng ranh giới đó lại — mỗi trường hợp đều kiểm tra cả hai gate cùng lúc để không
ai vô tình siết gate hiển thị về bằng gate sự kiện lần nữa.
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.patrol_person_visibility import (  # noqa: E402
    limb_fragment_person_box,
    patrol_person_meets_detection_gate,
    patrol_person_meets_display_gate,
    plausible_person_silhouette,
)
from app.ppe_analyzer import _plausible_flycam_aerial  # noqa: E402

FW, FH = 1280, 720


def _box(x1f: float, y1f: float, x2f: float, y2f: float):
    return (FW * x1f, FH * y1f, FW * x2f, FH * y2f)


class TestBodycamDisplayGate(unittest.TestCase):
    def test_seated_person_low_in_frame_draws_roi_but_no_event(self):
        """Người ngồi ghế nhìn từ camera đội đầu luôn rơi xuống nửa dưới khung."""
        seated = _box(0.38, 0.55, 0.62, 0.88)
        self.assertTrue(patrol_person_meets_display_gate(seated, FW, FH))
        self.assertFalse(patrol_person_meets_detection_gate(seated, FW, FH))

    def test_mid_frame_torso_draws_roi_but_no_event(self):
        """Bụng/đùi giữa khung: không đủ để ghi sự kiện, nhưng vẫn là người."""
        torso = _box(0.35, 0.42, 0.65, 0.72)
        self.assertTrue(patrol_person_meets_display_gate(torso, FW, FH))
        self.assertFalse(patrol_person_meets_detection_gate(torso, FW, FH))

    def test_full_body_passes_both_gates(self):
        person = _box(0.40, 0.20, 0.60, 0.55)
        self.assertTrue(patrol_person_meets_display_gate(person, FW, FH))
        self.assertTrue(patrol_person_meets_detection_gate(person, FW, FH))

    def test_shin_fragment_rejected_by_both(self):
        """Cẳng chân: dài, hẹp, nằm hẳn nửa dưới — mảnh vỡ của box khác."""
        shin = _box(0.44, 0.62, 0.50, 0.95)
        self.assertTrue(limb_fragment_person_box(shin, FW, FH))
        self.assertFalse(patrol_person_meets_display_gate(shin, FW, FH))
        self.assertFalse(patrol_person_meets_detection_gate(shin, FW, FH))

    def test_own_feet_hugging_bottom_edge_rejected(self):
        """Chân của chính người đeo camera — luôn dính đáy khung."""
        feet = _box(0.30, 0.66, 0.70, 0.99)
        self.assertTrue(limb_fragment_person_box(feet, FW, FH))
        self.assertFalse(patrol_person_meets_display_gate(feet, FW, FH))

    def test_narrow_strip_rejected_by_both(self):
        strip = _box(0.02, 0.15, 0.05, 0.55)
        self.assertFalse(patrol_person_meets_display_gate(strip, FW, FH))
        self.assertFalse(patrol_person_meets_detection_gate(strip, FW, FH))

    def test_scaffold_vertical_bar_rejected(self):
        """Than giàn giáo dọc — YOLO FP hay conf cao."""
        scaffold = _box(0.46, 0.18, 0.50, 0.62)
        self.assertFalse(patrol_person_meets_display_gate(scaffold, FW, FH))

    def test_small_distant_worker_passes_display_gate(self):
        """Người xa trên công trường — bbox nhỏ hơn ngưỡng silhouette cũ."""
        distant = _box(0.62, 0.38, 0.66, 0.52)
        self.assertTrue(patrol_person_meets_display_gate(distant, FW, FH))


class TestFlycamDisplayGate(unittest.TestCase):
    def test_large_seated_person_close_to_drone_passes_display_gate(self):
        """Drone bay thấp — người ngồi chiếm quá 55% khung, gate sự kiện loại thẳng."""
        seated = _box(0.28, 0.20, 0.73, 0.82)
        self.assertFalse(_plausible_flycam_aerial(seated, FW, FH))
        self.assertTrue(patrol_person_meets_display_gate(seated, FW, FH, flycam=True))

    def test_wide_low_aspect_blob_passes_display_gate(self):
        """Người ngồi co lại nhìn từ trên xuống — rộng hơn cao, aspect dưới 0.22."""
        blob = (FW * 0.45, FH * 0.50, FW * 0.45 + 200.0, FH * 0.50 + 30.0)
        aspect = (blob[3] - blob[1]) / (blob[2] - blob[0])
        self.assertLess(aspect, 0.22, "case này phải nằm dưới sàn của gate sự kiện")
        self.assertFalse(_plausible_flycam_aerial(blob, FW, FH))
        self.assertTrue(patrol_person_meets_display_gate(blob, FW, FH, flycam=True))

    def test_tiny_standing_person_passes_both(self):
        tiny = _box(0.49, 0.40, 0.51, 0.415)
        self.assertTrue(_plausible_flycam_aerial(tiny, FW, FH))
        self.assertTrue(patrol_person_meets_display_gate(tiny, FW, FH, flycam=True))

    def test_sub_pixel_noise_rejected(self):
        speck = (FW * 0.50, FH * 0.50, FW * 0.50 + 3.0, FH * 0.50 + 4.0)
        self.assertFalse(patrol_person_meets_display_gate(speck, FW, FH, flycam=True))

    def test_flycam_silhouette_wider_than_ground_level(self):
        blob = (FW * 0.45, FH * 0.50, FW * 0.45 + 200.0, FH * 0.50 + 30.0)
        self.assertTrue(plausible_person_silhouette(blob, FW, FH, flycam=True))
        self.assertFalse(plausible_person_silhouette(blob, FW, FH))


if __name__ == "__main__":
    unittest.main()
