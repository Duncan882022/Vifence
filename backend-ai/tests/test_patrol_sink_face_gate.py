"""Sink — chỉ lên Người khi face_eligible; tay che mặt / đổi tư thế → Đối tượng hoặc gộp."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

import numpy as np

from app.patrol import daystore, db, identity, sink

_OBJECT_CONFIRM = 3.0
_FACE_CONFIRM = 1.5


def _vec(seed: int, dim: int = 128) -> list[float]:
    rng = np.random.default_rng(seed)
    v = rng.normal(size=dim).astype(np.float32)
    return (v / np.linalg.norm(v)).tolist()


class PatrolSinkFaceGateTests(unittest.TestCase):
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

    def test_embedding_without_face_eligible_stays_object(self) -> None:
        """Tay che mặt / recover lỗi — có vector nhưng không eligible → obj, không pers."""
        t0 = 1_000.0
        box = [80.0, 60.0, 220.0, 420.0]
        sink.record_observation(
            camera_id="HC-01",
            track_id="ptk0001:person",
            person_bbox=box,
            face_embedding=_vec(42),
            face_quality=0.9,
            face_eligible=False,
            now=t0,
        )
        oid = sink.record_observation(
            camera_id="HC-01",
            track_id="ptk0001:person",
            person_bbox=box,
            face_embedding=_vec(42),
            face_quality=0.9,
            face_eligible=False,
            now=t0 + _OBJECT_CONFIRM,
        )
        self.assertTrue(str(oid).startswith("obj-"))
        self.assertEqual(daystore.list_person_events(db.today_vn(t0)), [])

    def test_identified_posture_change_reuses_pers_without_face(self) -> None:
        """Định danh rồi — track mới, bbox lệch, không mặt → gộp pers cũ, không đẻ mới."""
        t0 = 1_000.0
        sit_box = [80.0, 200.0, 220.0, 480.0]
        stand_box = [70.0, 40.0, 240.0, 420.0]
        sink.record_observation(
            camera_id="HC-01",
            track_id="ptk0001:person",
            person_bbox=sit_box,
            face_embedding=_vec(7),
            face_quality=0.9,
            face_eligible=True,
            now=t0,
        )
        pers = sink.record_observation(
            camera_id="HC-01",
            track_id="ptk0001:person",
            person_bbox=sit_box,
            face_embedding=_vec(7),
            face_quality=0.9,
            face_eligible=True,
            now=t0 + _FACE_CONFIRM,
        )
        identity.identify(str(pers), full_name="Duncan", employee_code="SGC-6688")
        sink.forget_track("HC-01", "ptk0001:person", now=t0 + 2.0)

        sink.record_observation(
            camera_id="HC-01",
            track_id="ptk0008:person",
            person_bbox=stand_box,
            now=t0 + 3.0,
        )
        again = sink.record_observation(
            camera_id="HC-01",
            track_id="ptk0008:person",
            person_bbox=stand_box,
            now=t0 + 3.0 + _OBJECT_CONFIRM,
        )
        self.assertEqual(again, pers)
        self.assertEqual(len(daystore.list_person_events(db.today_vn(t0))), 1)
        row = identity.get_person(str(pers))
        self.assertEqual(identity.display_name(row), "Duncan")

    def test_known_track_without_face_keeps_snapshot(self) -> None:
        """Quay lưng / tay che — không ghi đè ảnh định danh bằng khung không mặt."""
        t0 = 1_000.0
        box = [80.0, 60.0, 220.0, 420.0]
        frame = np.zeros((480, 640, 3), dtype=np.uint8)
        sink.record_observation(
            camera_id="HC-01",
            track_id="ptk0001:person",
            person_bbox=box,
            face_embedding=_vec(8),
            face_quality=0.9,
            face_eligible=True,
            confidence=0.85,
            frame=frame,
            now=t0,
        )
        pers = sink.record_observation(
            camera_id="HC-01",
            track_id="ptk0001:person",
            person_bbox=box,
            face_embedding=_vec(8),
            face_quality=0.9,
            face_eligible=True,
            confidence=0.85,
            frame=frame,
            now=t0 + _FACE_CONFIRM,
        )
        identity.identify(str(pers), full_name="Duncan", employee_code="SGC-6688")
        card = daystore.list_person_events(db.today_vn(t0))[0]
        first_path = card["snapshot_path"]
        self.assertTrue(first_path)

        sink.record_observation(
            camera_id="HC-01",
            track_id="ptk0001:person",
            person_bbox=box,
            face_quality=0.0,
            face_eligible=False,
            confidence=0.9,
            frame=frame,
            now=t0 + 20.0,
        )
        card = daystore.list_person_events(db.today_vn(t0))[0]
        self.assertEqual(card["snapshot_path"], first_path)


if __name__ == "__main__":
    unittest.main()
