"""Bù chuyển động camera — lia mũ không được làm đứt track."""

from __future__ import annotations

import unittest

import numpy as np

from app.patrol import egomotion
from app.patrol_tracker import PROFILE_BODYCAM, PatrolTracker


def _textured_frame(w: int = 640, h: int = 360, seed: int = 7) -> np.ndarray:
    """Cảnh có kết cấu — phaseCorrelate cần chi tiết để bám."""
    rng = np.random.default_rng(seed)
    return (rng.random((h, w, 3)) * 255).astype(np.uint8)


def _shift_frame(frame: np.ndarray, dx: int, dy: int) -> np.ndarray:
    """Dời cả khung hình — mô phỏng camera lia sang chỗ khác."""
    return np.roll(np.roll(frame, dy, axis=0), dx, axis=1)


def _box(cx: float, cy: float, w: float, h: float):
    return (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)


class EstimateShiftTests(unittest.TestCase):
    def setUp(self) -> None:
        egomotion.reset()

    def test_first_frame_reports_no_shift(self) -> None:
        self.assertEqual(egomotion.estimate_shift("HC-01", _textured_frame()), (0.0, 0.0))

    def test_detects_horizontal_pan(self) -> None:
        base = _textured_frame()
        egomotion.estimate_shift("HC-01", base)
        dx, dy = egomotion.estimate_shift("HC-01", _shift_frame(base, 40, 0))

        self.assertGreater(dx, 25.0)
        self.assertLess(abs(dy), 12.0)

    def test_detects_vertical_tilt(self) -> None:
        base = _textured_frame()
        egomotion.estimate_shift("HC-02", base)
        dx, dy = egomotion.estimate_shift("HC-02", _shift_frame(base, 0, 24))

        self.assertGreater(dy, 12.0)
        self.assertLess(abs(dx), 12.0)

    def test_static_scene_reports_near_zero(self) -> None:
        base = _textured_frame()
        egomotion.estimate_shift("HC-01", base)
        dx, dy = egomotion.estimate_shift("HC-01", base.copy())

        self.assertLess(abs(dx), 2.0)
        self.assertLess(abs(dy), 2.0)

    def test_cameras_tracked_separately(self) -> None:
        base = _textured_frame()
        egomotion.estimate_shift("HC-01", base)
        # Khung đầu của camera khác không được so với khung của camera này.
        self.assertEqual(egomotion.estimate_shift("DR-03", base), (0.0, 0.0))


class TrackerEgoMotionTests(unittest.TestCase):
    def test_pan_keeps_track_id(self) -> None:
        """Người đứng yên, camera lia — phải giữ nguyên track.

        Không bù thì bbox trượt 260px giữa hai nhịp, vượt cổng ghép và tracker
        cấp mã mới cho đúng người vẫn đang đứng đó.
        """
        tracker = PatrolTracker(camera_id="HC-01", profile=PROFILE_BODYCAM)
        t = 0.0
        first = tracker.update([(_box(900, 400, 120, 300), 0.7)], now=t)[0]

        t += 0.17
        again = tracker.update(
            [(_box(640, 400, 120, 300), 0.7)],
            now=t,
            camera_shift=(-260.0, 0.0),
        )[0]

        self.assertEqual(first, again)

    def test_pan_without_compensation_breaks_track(self) -> None:
        """Chứng minh ngược lại: thiếu bù thì đúng là track đứt."""
        tracker = PatrolTracker(camera_id="HC-01", profile=PROFILE_BODYCAM)
        t = 0.0
        first = tracker.update([(_box(900, 400, 120, 300), 0.7)], now=t)[0]
        t += 0.17
        again = tracker.update([(_box(640, 400, 120, 300), 0.7)], now=t)[0]

        self.assertNotEqual(first, again)

    def test_shift_accumulates_over_lost_frames(self) -> None:
        """Bị che trong lúc camera vẫn đang lia — cộng dồn cả quãng đã lia."""
        tracker = PatrolTracker(camera_id="HC-01", profile=PROFILE_BODYCAM)
        t = 0.0
        first = tracker.update([(_box(900, 400, 120, 300), 0.7)], now=t)[0]

        for _ in range(3):
            t += 0.17
            tracker.update([], now=t, camera_shift=(-80.0, 0.0))

        t += 0.17
        again = tracker.update(
            [(_box(660, 400, 120, 300), 0.7)],
            now=t,
            camera_shift=(-80.0, 0.0),
        )[0]

        self.assertEqual(first, again)

    def test_velocity_excludes_camera_motion(self) -> None:
        """Người đứng yên trong khi camera lia thì vận tốc phải gần 0.

        Nếu không trừ, frontend nhận vận tốc của cái mũ và nội suy ROI bay đi
        trong lúc người không hề nhúc nhích.
        """
        tracker = PatrolTracker(camera_id="HC-01", profile=PROFILE_BODYCAM)
        t = 0.0
        tid = tracker.update([(_box(900, 400, 120, 300), 0.7)], now=t)[0]

        x = 900.0
        for _ in range(6):
            t += 0.17
            x -= 60.0
            tid = tracker.update(
                [(_box(x, 400, 120, 300), 0.7)],
                now=t,
                camera_shift=(-60.0, 0.0),
            )[0]

        vx, _vy = tracker.get(tid).velocity()
        self.assertLess(abs(vx), 80.0)

    def test_walking_person_still_gets_velocity(self) -> None:
        """Bù ego không được làm mất vận tốc thật của người đang đi."""
        tracker = PatrolTracker(camera_id="HC-01", profile=PROFILE_BODYCAM)
        t = 0.0
        tid = None
        x = 200.0
        for _ in range(8):
            t += 0.17
            x += 60.0
            tid = tracker.update(
                [(_box(x, 400, 120, 300), 0.7)],
                now=t,
                camera_shift=(0.0, 0.0),
            )[0]

        vx, _vy = tracker.get(tid).velocity()
        self.assertGreater(vx, 150.0)


if __name__ == "__main__":
    unittest.main()
