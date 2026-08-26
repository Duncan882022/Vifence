"""Vòng đời Đối tượng → Người → Định danh: chỉ tiến, không lùi."""

import unittest

from app import patrol_identity_lifecycle as lifecycle
from app.patrol_identity_lifecycle import (
    TIER_IDENTITY,
    TIER_OBJECT,
    TIER_PERSON,
    observe,
    peek,
    reset,
)

CAM = "HC-01"
TRACK = "ptk0001:person"

# Quan sát trong cùng một frame bị khử trùng, nên test phải bước thời gian ra xa
# hơn cửa sổ đó để mỗi lần gọi được tính là một frame riêng.
STEP = lifecycle._OBSERVE_DEDUPE_SEC * 2


class TestTierPromotion(unittest.TestCase):
    def setUp(self):
        reset()

    def test_starts_as_object_without_id(self):
        got = observe(CAM, TRACK, worker_id="", worker_name="", now=1.0)
        self.assertEqual(got.tier, TIER_OBJECT)
        self.assertEqual(got.tier_label, "Đối tượng")
        self.assertIsNone(got.transition)

    def test_object_to_person_on_first_sgc(self):
        observe(CAM, TRACK, worker_id="", worker_name="", now=1.0)
        got = observe(CAM, TRACK, worker_id="sgc-00000007", worker_name="", now=1.0 + STEP)

        self.assertEqual(got.tier, TIER_PERSON)
        self.assertEqual(got.tier_label, "Người")
        self.assertIsNotNone(got.transition)
        self.assertEqual(got.transition.from_tier, TIER_OBJECT)
        self.assertEqual(got.transition.to_tier, TIER_PERSON)

    def test_person_to_identity_needs_two_frames(self):
        observe(CAM, TRACK, worker_id="sgc-00000007", worker_name="", now=1.0)

        first = observe(CAM, TRACK, worker_id="p-102", worker_name="Nguyễn Văn A", now=1.0 + STEP)
        self.assertEqual(first.tier, TIER_PERSON, "một frame gallery chưa đủ để dán tên thật")

        second = observe(
            CAM, TRACK, worker_id="p-102", worker_name="Nguyễn Văn A", now=1.0 + STEP * 2,
        )
        self.assertEqual(second.tier, TIER_IDENTITY)
        self.assertEqual(second.worker_name, "Nguyễn Văn A")
        self.assertIsNotNone(second.transition)


class TestNoDemotion(unittest.TestCase):
    def setUp(self):
        reset()

    def test_person_never_falls_back_to_object(self):
        """Quay lưng giữa chừng: nhãn phải giữ nguyên, không nhấp nháy."""
        observe(CAM, TRACK, worker_id="sgc-00000007", worker_name="", now=1.0)

        for step in range(1, 6):
            got = observe(CAM, TRACK, worker_id="", worker_name="", now=1.0 + STEP * step)
            self.assertEqual(got.tier, TIER_PERSON)
            self.assertEqual(got.worker_id, "sgc-00000007")

    def test_identity_never_falls_back(self):
        t = 1.0
        observe(CAM, TRACK, worker_id="p-102", worker_name="Nguyễn Văn A", now=t)
        t += STEP
        observe(CAM, TRACK, worker_id="p-102", worker_name="Nguyễn Văn A", now=t)

        t += STEP
        got = observe(CAM, TRACK, worker_id="sgc-00000009", worker_name="", now=t)
        self.assertEqual(got.tier, TIER_IDENTITY)
        self.assertEqual(got.worker_id, "p-102")

        t += STEP
        got = observe(CAM, TRACK, worker_id="", worker_name="", now=t)
        self.assertEqual(got.tier, TIER_IDENTITY)
        self.assertEqual(got.worker_name, "Nguyễn Văn A")


class TestIdentitySwitch(unittest.TestCase):
    def setUp(self):
        reset()

    def test_name_does_not_flip_on_single_bad_match(self):
        t = 1.0
        for _ in range(2):
            observe(CAM, TRACK, worker_id="p-102", worker_name="Nguyễn Văn A", now=t)
            t += STEP

        t += STEP
        got = observe(CAM, TRACK, worker_id="p-777", worker_name="Trần Văn B", now=t)
        self.assertEqual(got.worker_id, "p-102", "một frame khớp nhầm không được đổi tên")

    def test_sustained_match_does_switch(self):
        t = 1.0
        for _ in range(2):
            observe(CAM, TRACK, worker_id="p-102", worker_name="Nguyễn Văn A", now=t)
            t += STEP

        for _ in range(3):
            got = observe(CAM, TRACK, worker_id="p-777", worker_name="Trần Văn B", now=t)
            t += STEP
        self.assertEqual(got.worker_id, "p-777")
        self.assertEqual(got.worker_name, "Trần Văn B")


class TestDedupeAndIsolation(unittest.TestCase):
    def setUp(self):
        reset()

    def test_same_frame_observed_twice_counts_once(self):
        """ROI và sự kiện cùng quan sát một frame — không được tính thành hai."""
        observe(CAM, TRACK, worker_id="sgc-00000007", worker_name="", now=1.0)
        observe(CAM, TRACK, worker_id="p-102", worker_name="A", now=2.0)
        got = observe(CAM, TRACK, worker_id="p-102", worker_name="A", now=2.0)
        self.assertEqual(got.tier, TIER_PERSON, "hai lần gọi trong một frame vẫn là một hit")

    def test_tracks_and_cameras_isolated(self):
        observe(CAM, TRACK, worker_id="sgc-00000007", worker_name="", now=1.0)
        observe("HC-02", TRACK, worker_id="", worker_name="", now=1.0)

        self.assertEqual(peek(CAM, TRACK).tier, TIER_PERSON)
        self.assertEqual(peek("HC-02", TRACK).tier, TIER_OBJECT)
        self.assertIsNone(peek(CAM, "ptk9999:person"))

        reset("HC-02")
        self.assertIsNone(peek("HC-02", TRACK))
        self.assertIsNotNone(peek(CAM, TRACK))


if __name__ == "__main__":
    unittest.main()
