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

_PERSON_BOX = [85.0, 62.0, 225.0, 425.0]


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
                face_eligible=True,
                face_quality=0.9,
                person_bbox=_PERSON_BOX,
                now=t,
            )
            seen.add(pid)
            t += 0.4

        self.assertEqual(len({x for x in seen if x is not None}), 1, f"phải một mã, nhận được {seen}")
        self.assertEqual(len(identity.list_persons()), 1)
        self.assertEqual(len(daystore.list_person_events(db.today_vn(1_000.0))), 1)

    def test_track_accumulates_face_angles(self) -> None:
        """Mỗi người phải tích được nhiều góc — một vector thì gặp lại là trượt."""
        base = _vec(2)
        pid, _ = identity.observe_face(
            _angle(base, 0.95, seed=201),
            quality=0.9,
            preferred_tk="tk-0000001",
            now=1_000.0,
        )
        identity.add_face_angle(pid, _angle(base, 0.72, seed=202), quality=0.85, now=1_001.0)
        identity.add_face_angle(pid, _angle(base, 0.58, seed=203), quality=0.8, now=1_002.0)
        rows = db.query("SELECT COUNT(*) n FROM person_faces WHERE pers_id = ?", (pid,))
        self.assertGreater(int(rows[0]["n"]), 1)
        self.assertLessEqual(int(rows[0]["n"]), identity.MAX_FACES_PER_PERSON)

    def test_new_track_matches_person_via_any_stored_angle(self) -> None:
        """Nhiều góc đã lưu thì track mới chỉ cần khớp một góc bất kỳ."""
        base = _vec(3)
        first, _ = identity.observe_face(
            _angle(base, 0.95, seed=301),
            quality=0.9,
            preferred_tk="tk-0000001",
            now=1_000.0,
        )
        identity.add_face_angle(
            first,
            _angle(base, 0.70, seed=302),
            quality=0.85,
            now=1_001.0,
        )
        t = 1_100.0
        again = sink.record_observation(
            camera_id="HC-02", track_id="ptk0077:person",
            face_embedding=_angle(base, 0.92, seed=303), face_quality=0.9,
            face_eligible=True, person_bbox=_PERSON_BOX,
            now=t,
        )
        again = sink.record_observation(
            camera_id="HC-02", track_id="ptk0077:person",
            face_embedding=_angle(base, 0.92, seed=303), face_quality=0.9,
            face_eligible=True, person_bbox=_PERSON_BOX,
            now=t + 0.4,
        )
        self.assertEqual(again, first)
        self.assertEqual(len(identity.list_persons()), 1)

    def test_genuinely_different_people_stay_separate(self) -> None:
        """Nới ngưỡng không được kéo theo việc nhập hai người làm một."""
        a = sink.record_observation(
            camera_id="HC-02", track_id="ptk0001:person",
            face_embedding=_vec(10).tolist(), face_quality=0.9, person_bbox=_PERSON_BOX, now=1_000.0,
            face_eligible=True,
        )
        a = sink.record_observation(
            camera_id="HC-02", track_id="ptk0001:person",
            face_embedding=_vec(10).tolist(), face_quality=0.9, person_bbox=_PERSON_BOX, now=1_001.5,
            face_eligible=True,
        )
        sink.record_observation(
            camera_id="HC-02", track_id="ptk0002:person",
            face_embedding=_vec(11).tolist(), face_quality=0.9, person_bbox=_PERSON_BOX, now=1_100.0,
            face_eligible=True,
        )
        b = sink.record_observation(
            camera_id="HC-02", track_id="ptk0002:person",
            face_embedding=_vec(11).tolist(), face_quality=0.9, person_bbox=_PERSON_BOX, now=1_101.5,
            face_eligible=True,
        )
        self.assertNotEqual(a, b)
        self.assertEqual(len(identity.list_persons()), 2)

    def test_identified_person_keeps_name_across_tracks(self) -> None:
        base = _vec(4)
        pers = sink.record_observation(
            camera_id="HC-01", track_id="ptk0001:person",
            face_embedding=_angle(base, 0.95, seed=1), face_quality=0.9, person_bbox=_PERSON_BOX, now=1_000.0,
            face_eligible=True,
        )
        pers = sink.record_observation(
            camera_id="HC-01", track_id="ptk0001:person",
            face_embedding=_angle(base, 0.95, seed=1), face_quality=0.9, person_bbox=_PERSON_BOX, now=1_001.5,
            face_eligible=True,
        )
        identity.identify(str(pers), full_name="Nguyễn Văn A", employee_code="NV001")

        again = sink.record_observation(
            camera_id="HC-02", track_id="ptk0050:person",
            face_embedding=_angle(base, 0.90, seed=2), face_quality=0.9, person_bbox=_PERSON_BOX, now=2_000.0,
            face_eligible=True,
        )
        again = sink.record_observation(
            camera_id="HC-02", track_id="ptk0050:person",
            face_embedding=_angle(base, 0.90, seed=2), face_quality=0.9, person_bbox=_PERSON_BOX, now=2_001.5,
            face_eligible=True,
        )
        self.assertEqual(again, pers)
        row = identity.get_person(str(again))
        self.assertEqual(identity.display_name(row), "Nguyễn Văn A")
        self.assertEqual(len(daystore.list_person_events(db.today_vn(1_000.0))), 1)

    def test_two_tk_labels_same_face_one_person(self) -> None:
        """ByteTrack tách 2 track — tk-01/tk-02 cùng người phải một pers-*."""
        base = _vec(6)
        emb_a = _angle(base, 0.94, seed=601)
        emb_b = _angle(base, 0.91, seed=602)
        pid_a, created_a = identity.observe_face(
            emb_a, quality=0.9, preferred_tk="tk-0000001", now=1_000.0,
        )
        pid_b, created_b = identity.observe_face(
            emb_b, quality=0.9, preferred_tk="tk-0000002", now=1_005.0,
        )
        self.assertTrue(created_a)
        self.assertFalse(created_b)
        self.assertEqual(pid_a, pid_b)
        self.assertEqual(len(identity.list_persons()), 1)

    def test_process_identity_two_tk_tracks_one_person(self) -> None:
        """Aggregator: tk-01/tk-02 song song — process_identity phải gom một pers."""
        from app.patrol.aggregator.identity_pipeline import process_identity
        from app.patrol.aggregator.session_store import get_or_create, reset as reset_sessions
        from app.patrol.aggregator.types import ObservationInput

        reset_sessions()
        base = _vec(7)
        emb_a = _angle(base, 0.93, seed=701)
        emb_b = _angle(base, 0.90, seed=702)
        box = (85.0, 62.0, 225.0, 425.0)

        s1 = get_or_create("DR-03", "bt-1", ts=2_000.0)
        obs1 = ObservationInput(
            camera_id="DR-03",
            track_id="bt-1",
            ts=2_000.0,
            person_bbox=box,
            face_embedding=emb_a,
            face_quality=0.88,
            face_eligible=True,
            confidence=0.85,
            lifecycle_worker_id="tk-0000001",
            lifecycle_tier="person",
        )
        pid1 = process_identity(s1, obs1)

        s2 = get_or_create("DR-03", "bt-2", ts=2_005.0)
        obs2 = ObservationInput(
            camera_id="DR-03",
            track_id="bt-2",
            ts=2_005.0,
            person_bbox=box,
            face_embedding=emb_b,
            face_quality=0.86,
            face_eligible=True,
            confidence=0.84,
            lifecycle_worker_id="tk-0000002",
            lifecycle_tier="person",
        )
        pid2 = process_identity(s2, obs2)

        self.assertIsNotNone(pid1)
        self.assertEqual(pid1, pid2)
        self.assertEqual(len(identity.list_persons()), 1)


if __name__ == "__main__":
    unittest.main()
