"""Gộp mã người giữa các mũ và giữ bộ nhớ khuôn mặt theo ca.

Hai nguồn đếm trùng còn lại sau khi tracker đã bám tốt:

* Mã `sgc-*` chỉ được tái dùng trong phạm vi một camera, nên cùng một công nhân
  được hai mũ ghi nhận là thành hai người trên KPI.
* Bộ nhớ khuôn mặt dùng chung hạn ba phút với bộ nhớ vị trí, trong khi chỉ huy đi
  một vòng công trường mất mười lăm phút — quay lại gặp đúng người đó là hệ thống
  đã quên.
"""

from __future__ import annotations

import sys
import time
import unittest
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.person_identity_registry import (  # noqa: E402
    _FACE_META_TTL_SEC,
    _TRACK_META_MAX_ROWS,
    _TRACK_META_TTL_SEC,
    _expected_emb_dim,
    _find_reusable_worker_id,
    _prune_track_meta,
)
from app.worker_identity import face_thresholds  # noqa: E402

FW, FH = 1280, 720


def _emb_with_similarity(target: float) -> list[float]:
    dim = _expected_emb_dim()
    vec = np.zeros(dim, dtype=np.float64)
    vec[0] = target
    vec[1] = (1.0 - target**2) ** 0.5
    return vec.tolist()


def _query_emb() -> list[float]:
    dim = _expected_emb_dim()
    vec = np.zeros(dim, dtype=np.float64)
    vec[0] = 1.0
    return vec.tolist()


def _meta(worker_id: str, bbox: list[float], emb: list[float], age_sec: float) -> dict:
    return {
        "worker_id": worker_id,
        "bbox": bbox,
        "face_emb": emb,
        "updated_at": time.time() - age_sec,
    }


class TestFaceMemoryOutlivesPosition(unittest.TestCase):
    def test_face_ttl_spans_a_shift(self):
        self.assertGreaterEqual(_FACE_META_TTL_SEC, 8 * 3600.0)
        self.assertGreater(_FACE_META_TTL_SEC, _TRACK_META_TTL_SEC)

    def test_same_person_after_a_long_patrol_loop_keeps_id(self):
        """Đi một vòng 15 phút rồi gặp lại — quá hạn vị trí nhưng không quá hạn mặt."""
        state = {
            "next_seq": 9,
            "tracks": {},
            "track_meta": {
                "HC-01|ptk0001:person": _meta(
                    "sgc-00000001", [600.0, 300.0, 720.0, 600.0], _query_emb(), 900.0,
                ),
            },
        }
        reused = _find_reusable_worker_id(
            state,
            "HC-01",
            [200.0, 280.0, 320.0, 580.0],
            frame_w=FW,
            frame_h=FH,
            face_emb=np.asarray(_query_emb()),
        )
        self.assertEqual(reused, "sgc-00000001")

    def test_stale_position_alone_no_longer_matches(self):
        """Hết hạn vị trí mà không có khuôn mặt thì đừng gộp — đó là đoán mò."""
        state = {
            "next_seq": 9,
            "tracks": {},
            "track_meta": {
                "HC-01|ptk0001:person": {
                    "worker_id": "sgc-00000001",
                    "bbox": [600.0, 300.0, 720.0, 600.0],
                    "updated_at": time.time() - (_TRACK_META_TTL_SEC + 60.0),
                },
            },
        }
        reused = _find_reusable_worker_id(
            state, "HC-01", [600.0, 300.0, 720.0, 600.0], frame_w=FW, frame_h=FH,
        )
        self.assertIsNone(reused)


class TestCrossCameraReuse(unittest.TestCase):
    def test_same_worker_seen_by_second_helmet_keeps_one_id(self):
        state = {
            "next_seq": 9,
            "tracks": {},
            "track_meta": {
                "HC-01|ptk0001:person": _meta(
                    "sgc-00000001", [600.0, 300.0, 720.0, 600.0], _query_emb(), 120.0,
                ),
            },
        }
        reused = _find_reusable_worker_id(
            state,
            "HC-02",
            [100.0, 200.0, 240.0, 560.0],
            frame_w=FW,
            frame_h=FH,
            face_emb=np.asarray(_query_emb()),
        )
        self.assertEqual(reused, "sgc-00000001")

    def test_cross_camera_needs_higher_similarity_than_same_camera(self):
        """Qua mũ khác không còn toạ độ chung — phải bù bằng ngưỡng mặt cao hơn."""
        same_floor = face_thresholds.reuse_min_similarity()
        cross_floor = face_thresholds.cross_camera_min_similarity()
        self.assertGreater(cross_floor, same_floor)

        # Đủ cho cùng camera, chưa đủ để dám gộp qua mũ khác.
        borderline = _emb_with_similarity((same_floor + cross_floor) / 2.0)
        state = {
            "next_seq": 9,
            "tracks": {},
            "track_meta": {
                "HC-01|ptk0001:person": _meta(
                    "sgc-00000001", [600.0, 300.0, 720.0, 600.0], borderline, 120.0,
                ),
            },
        }
        self.assertIsNone(
            _find_reusable_worker_id(
                state,
                "HC-02",
                [100.0, 200.0, 240.0, 560.0],
                frame_w=FW,
                frame_h=FH,
                face_emb=np.asarray(_query_emb()),
            ),
        )
        self.assertEqual(
            _find_reusable_worker_id(
                state,
                "HC-01",
                [610.0, 300.0, 730.0, 600.0],
                frame_w=FW,
                frame_h=FH,
                face_emb=np.asarray(_query_emb()),
            ),
            "sgc-00000001",
        )

    def test_two_different_faces_across_helmets_stay_separate(self):
        other_face = _emb_with_similarity(0.10)
        state = {
            "next_seq": 9,
            "tracks": {},
            "track_meta": {
                "HC-01|ptk0001:person": _meta(
                    "sgc-00000001", [600.0, 300.0, 720.0, 600.0], other_face, 120.0,
                ),
            },
        }
        self.assertIsNone(
            _find_reusable_worker_id(
                state,
                "HC-02",
                [100.0, 200.0, 240.0, 560.0],
                frame_w=FW,
                frame_h=FH,
                face_emb=np.asarray(_query_emb()),
            ),
        )


class TestTrackMetaPruning(unittest.TestCase):
    def test_prune_keeps_newest_rows_within_cap(self):
        now = time.time()
        meta = {
            f"HC-01|ptk{i:05d}:person": {
                "worker_id": f"sgc-{i:08d}",
                "bbox": [0.0, 0.0, 10.0, 10.0],
                "updated_at": now - i,
            }
            for i in range(_TRACK_META_MAX_ROWS + 250)
        }
        state = {"track_meta": meta}
        _prune_track_meta(state)

        kept = state["track_meta"]
        self.assertLessEqual(len(kept), _TRACK_META_MAX_ROWS)
        self.assertIn("HC-01|ptk00000:person", kept, "dòng mới nhất phải được giữ")

    def test_prune_is_noop_below_cap(self):
        state = {"track_meta": {"HC-01|a": {"updated_at": time.time() - 10_000_000}}}
        _prune_track_meta(state)
        self.assertEqual(len(state["track_meta"]), 1)


if __name__ == "__main__":
    unittest.main()
