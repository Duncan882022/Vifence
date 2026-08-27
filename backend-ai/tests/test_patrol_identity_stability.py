"""Một người trong một track phải ra đúng một mã.

Bám sát sự cố thật: bodycam cho embedding rời rạc (cùng người, góc khác nhau
chỉ đạt 0.39–0.60), và vì so khớp chạy lại mỗi khung hình nên một người bị
tách thành pers-0001 … pers-0011.
"""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import numpy as np

from app.patrol import daystore, db, identity, sink


def _vec(seed: int, dim: int = 128) -> np.ndarray:
    rng = np.random.default_rng(seed)
    v = rng.normal(size=dim).astype(np.float32)
    return v / np.linalg.norm(v)


def _angle(base: np.ndarray, cosine: float, seed: int) -> list[float]:
    """Cùng khuôn mặt, góc khác — dựng vector lệch đúng một góc cho trước."""
    rng = np.random.default_rng(seed)
    noise = rng.normal(size=base.size).astype(np.float32)
    noise -= base * float(np.dot(noise, base))
    noise /= np.linalg.norm(noise)
    v = base * cosine + noise * float(np.sqrt(1.0 - cosine**2))
    return (v / np.linalg.norm(v)).tolist()


class TrackIdentityStabilityTests(unittest.TestCase):
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

    def test_one_track_one_person_even_with_wobbly_embeddings(self) -> None:
        """Đây là sự cố thật: 60 khung hình của một người, embedding lệch mạnh."""
        base = _vec(1)
        t = 1_000.0
        seen: set[str | None] = set()
        for i in range(60):
            emb = _angle(base, 0.45 + (i % 7) * 0.02, seed=100 + i)
            pid = sink.record_observation(
                camera_id="HC-02",
                track_id="ptk0001:person",
                face_embedding=emb,
                face_quality=0.9,
                now=t,
            )
            seen.add(pid)
            t += 0.17

        self.assertEqual(len({x for x in seen if x is not None}), 1, f"phải một mã, nhận được {seen}")
        self.assertEqual(len(identity.list_persons()), 1)
        self.assertEqual(len(daystore.list_person_events(db.today_vn(1_000.0))), 1)

    def test_track_accumulates_face_angles(self) -> None:
        """Mỗi người phải tích được nhiều góc — một vector thì gặp lại là trượt."""
        base = _vec(2)
        t = 1_000.0
        for i in range(30):
            sink.record_observation(
                camera_id="HC-02",
                track_id="ptk0002:person",
                face_embedding=_angle(base, 0.40 + i * 0.015, seed=200 + i),
                face_quality=0.9,
                now=t,
            )
            t += 0.17

        rows = db.query("SELECT COUNT(*) n FROM person_faces")
        self.assertGreater(int(rows[0]["n"]), 1)
        self.assertLessEqual(int(rows[0]["n"]), identity.MAX_FACES_PER_PERSON)

    def test_new_track_matches_person_via_any_stored_angle(self) -> None:
        """Nhiều góc đã lưu thì track mới chỉ cần khớp một góc bất kỳ."""
        base = _vec(3)
        t = 1_000.0
        for i in range(20):
            sink.record_observation(
                camera_id="HC-02", track_id="ptk0003:person",
                face_embedding=_angle(base, 0.45 + i * 0.02, seed=300 + i),
                face_quality=0.9, now=t,
            )
            t += 0.17
        first = sink.record_observation(
            camera_id="HC-02", track_id="ptk0003:person",
            face_embedding=_angle(base, 0.9, seed=999), face_quality=0.9, now=t,
        )

        # Người bị che rồi hiện lại: tracker cấp track mới, góc mặt gần một
        # trong những góc đã lưu.
        again = sink.record_observation(
            camera_id="HC-02", track_id="ptk0077:person",
            face_embedding=_angle(base, 0.85, seed=301), face_quality=0.9,
            now=t + 10,
        )
        again = sink.record_observation(
            camera_id="HC-02", track_id="ptk0077:person",
            face_embedding=_angle(base, 0.85, seed=301), face_quality=0.9,
            now=t + 10 + 1.5,
        )
        self.assertEqual(again, first)
        self.assertEqual(len(identity.list_persons()), 1)

    def test_genuinely_different_people_stay_separate(self) -> None:
        """Nới ngưỡng không được kéo theo việc nhập hai người làm một."""
        a = sink.record_observation(
            camera_id="HC-02", track_id="ptk0001:person",
            face_embedding=_vec(10).tolist(), face_quality=0.9, now=1_000.0,
        )
        a = sink.record_observation(
            camera_id="HC-02", track_id="ptk0001:person",
            face_embedding=_vec(10).tolist(), face_quality=0.9, now=1_001.5,
        )
        sink.record_observation(
            camera_id="HC-02", track_id="ptk0002:person",
            face_embedding=_vec(11).tolist(), face_quality=0.9, now=1_100.0,
        )
        b = sink.record_observation(
            camera_id="HC-02", track_id="ptk0002:person",
            face_embedding=_vec(11).tolist(), face_quality=0.9, now=1_101.5,
        )
        self.assertNotEqual(a, b)
        self.assertEqual(len(identity.list_persons()), 2)

    def test_identified_person_keeps_name_across_tracks(self) -> None:
        base = _vec(4)
        pers = sink.record_observation(
            camera_id="HC-01", track_id="ptk0001:person",
            face_embedding=_angle(base, 0.95, seed=1), face_quality=0.9, now=1_000.0,
        )
        pers = sink.record_observation(
            camera_id="HC-01", track_id="ptk0001:person",
            face_embedding=_angle(base, 0.95, seed=1), face_quality=0.9, now=1_001.5,
        )
        identity.identify(str(pers), full_name="Nguyễn Văn A", employee_code="NV001")

        again = sink.record_observation(
            camera_id="HC-02", track_id="ptk0050:person",
            face_embedding=_angle(base, 0.90, seed=2), face_quality=0.9, now=2_000.0,
        )
        again = sink.record_observation(
            camera_id="HC-02", track_id="ptk0050:person",
            face_embedding=_angle(base, 0.90, seed=2), face_quality=0.9, now=2_001.5,
        )
        self.assertEqual(again, pers)
        row = identity.get_person(str(again))
        self.assertEqual(identity.display_name(row), "Nguyễn Văn A")
        self.assertEqual(len(daystore.list_person_events(db.today_vn(1_000.0))), 1)


if __name__ == "__main__":
    unittest.main()
