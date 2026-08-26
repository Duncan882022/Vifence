"""Tracker tuần tra — ID phải bám người, không đổi theo ô lưới khung hình."""

import unittest

from app.patrol_tracker import (
    PROFILE_BODYCAM,
    PROFILE_FLYCAM,
    PatrolTracker,
    get_patrol_tracker,
    profile_for_camera,
    reset_patrol_trackers,
)


def _box(cx: float, cy: float, w: float, h: float):
    return (cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2)


class TestProfiles(unittest.TestCase):
    def test_camera_profiles(self):
        self.assertIs(profile_for_camera("DR-03"), PROFILE_FLYCAM)
        self.assertIs(profile_for_camera("HC-01"), PROFILE_BODYCAM)
        self.assertIs(profile_for_camera("HC-02"), PROFILE_BODYCAM)


class TestTrackStability(unittest.TestCase):
    def test_walking_person_keeps_one_id_across_grid_cells(self):
        """Điểm chết của tracker cũ: qua ranh giới ô lưới là đổi id."""
        tracker = PatrolTracker(camera_id="HC-01", profile=PROFILE_BODYCAM)
        ids = []
        t = 0.0
        # Người đi ngang toàn khung 1280px, mỗi frame 60px (≈ 5 FPS, đi bộ nhanh).
        for step in range(18):
            t += 0.2
            out = tracker.update([(_box(200 + step * 60, 400, 120, 300), 0.62)], now=t)
            ids.append(out[0])

        self.assertTrue(all(i is not None for i in ids))
        self.assertEqual(len(set(ids)), 1, f"ID phải giữ nguyên, nhận được {set(ids)}")

    def test_tiny_flycam_person_with_zero_iou_keeps_id(self):
        """Người 12px trên flycam: hai frame liên tiếp IoU = 0 vẫn phải cùng track."""
        tracker = PatrolTracker(camera_id="DR-03", profile=PROFILE_FLYCAM)
        t = 0.0
        first = tracker.update([(_box(600, 400, 10, 22), 0.24)], now=t)[0]
        t += 0.2
        # Dịch 18px — quá cạnh hộp, IoU bằng 0.
        second = tracker.update([(_box(618, 408, 10, 22), 0.24)], now=t)[0]

        self.assertIsNotNone(first)
        self.assertEqual(first, second)

    def test_two_people_never_swap_ids(self):
        tracker = PatrolTracker(camera_id="HC-01", profile=PROFILE_BODYCAM)
        t = 0.0
        left_ids, right_ids = [], []
        for step in range(10):
            t += 0.2
            out = tracker.update(
                [
                    (_box(300 + step * 20, 400, 110, 280), 0.7),
                    (_box(900 - step * 20, 400, 110, 280), 0.7),
                ],
                now=t,
            )
            left_ids.append(out[0])
            right_ids.append(out[1])

        self.assertEqual(len(set(left_ids)), 1)
        self.assertEqual(len(set(right_ids)), 1)
        self.assertNotEqual(left_ids[0], right_ids[0])

    def test_track_survives_short_occlusion(self):
        """Mất dấu 2 frame rồi hiện lại phải nhận lại track cũ, không cấp id mới."""
        tracker = PatrolTracker(camera_id="HC-01", profile=PROFILE_BODYCAM)
        t = 0.0
        for _ in range(3):
            t += 0.2
            first = tracker.update([(_box(600, 400, 120, 300), 0.7)], now=t)[0]

        # Hai frame không thấy người.
        for _ in range(2):
            t += 0.2
            tracker.update([], now=t)

        t += 0.2
        again = tracker.update([(_box(640, 400, 120, 300), 0.7)], now=t)[0]
        self.assertEqual(first, again)

    def test_track_dropped_after_lost_window(self):
        tracker = PatrolTracker(camera_id="HC-01", profile=PROFILE_BODYCAM)
        t = 0.0
        first = tracker.update([(_box(600, 400, 120, 300), 0.7)], now=t)[0]
        t += PROFILE_BODYCAM.lost_keep_sec + 0.5
        tracker.update([], now=t)
        t += 0.2
        again = tracker.update([(_box(600, 400, 120, 300), 0.7)], now=t)[0]
        self.assertNotEqual(first, again)

    def test_size_gate_blocks_far_person_stealing_near_track(self):
        """Người cận cảnh và người xa chồng tâm nhau không được gộp làm một."""
        tracker = PatrolTracker(camera_id="HC-01", profile=PROFILE_BODYCAM)
        t = 0.0
        near = tracker.update([(_box(600, 400, 300, 700), 0.8)], now=t)[0]
        t += 0.2
        # Cùng tâm nhưng nhỏ hơn ~20 lần diện tích.
        out = tracker.update([(_box(600, 400, 40, 90), 0.5)], now=t)[0]
        self.assertNotEqual(near, out)

    def test_velocity_is_exposed_for_interpolation(self):
        tracker = PatrolTracker(camera_id="HC-01", profile=PROFILE_BODYCAM)
        t = 0.0
        tid = None
        for step in range(6):
            t += 0.2
            tid = tracker.update([(_box(300 + step * 60, 400, 120, 300), 0.7)], now=t)[0]

        track = tracker.get(tid)
        self.assertIsNotNone(track)
        vx, _vy = track.velocity()
        # 60px mỗi 200ms ≈ 300 px/s; Kalman làm mượt nên chỉ cần đúng dấu và cỡ.
        self.assertGreater(vx, 60.0)


class TestTrackerRegistry(unittest.TestCase):
    def test_per_camera_isolation_and_reset(self):
        reset_patrol_trackers()
        a = get_patrol_tracker("HC-01")
        b = get_patrol_tracker("DR-03")
        self.assertIsNot(a, b)
        self.assertIs(get_patrol_tracker("HC-01"), a)

        a.update([(_box(100, 100, 50, 120), 0.7)], now=1.0)
        self.assertEqual(len(a.tracks), 1)
        reset_patrol_trackers("HC-01")
        self.assertEqual(len(get_patrol_tracker("HC-01").tracks), 0)


if __name__ == "__main__":
    unittest.main()
