"""Nối lại mã người sau khi bị che — không được sinh người mới trong đám đông.

Phép so mặt đòi ứng viên hạng nhất phải cách biệt hẳn hạng nhì. Trong đám đông
cùng đội mũ bảo hộ, cách biệt đó tụt về sát 0 đúng lúc cần nối lại track vừa vỡ
nhất, và hệ quả là cùng một công nhân được cấp hai mã rồi bị đếm thành hai người.
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
    _expected_emb_dim,
    _find_reusable_worker_id,
    _spatial_agreement,
)
from app.worker_identity import face_thresholds  # noqa: E402
from app.worker_identity.gallery import embedding_similarity  # noqa: E402

FW, FH = 1280, 720


def _emb_with_similarity(target: float) -> list[float]:
    """Vector hợp với trục 0 một góc cho trước — cosine đúng bằng `target`."""
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


def _state_with(rows: dict[str, dict]) -> dict:
    return {"next_seq": 9, "tracks": {}, "track_meta": rows}


def _meta(worker_id: str, bbox: list[float], emb: list[float], age_sec: float) -> dict:
    return {
        "worker_id": worker_id,
        "bbox": bbox,
        "face_emb": emb,
        "updated_at": time.time() - age_sec,
    }


class TestSpatialAgreement(unittest.TestCase):
    def test_same_spot_scores_high(self):
        box = [600.0, 300.0, 720.0, 600.0]
        self.assertGreater(_spatial_agreement(box, box, FW, FH, 0.0), 0.9)

    def test_window_widens_with_time_lost(self):
        """Người bị che năm giây đã đi tiếp — cửa sổ phải giãn theo, nếu không
        mọi ứng viên đều trượt đúng lúc cần nối lại nhất."""
        now_box = [820.0, 300.0, 940.0, 600.0]
        then_box = [600.0, 300.0, 720.0, 600.0]
        fresh = _spatial_agreement(now_box, then_box, FW, FH, 0.2)
        stale = _spatial_agreement(now_box, then_box, FW, FH, 5.0)
        self.assertGreater(stale, fresh)

    def test_opposite_corner_never_matches(self):
        a = [40.0, 40.0, 160.0, 340.0]
        b = [1100.0, 380.0, 1240.0, 700.0]
        self.assertEqual(_spatial_agreement(a, b, FW, FH, 5.0), 0.0)

    def test_missing_bbox_scores_zero(self):
        self.assertEqual(_spatial_agreement([0.0, 0.0, 10.0, 10.0], None, FW, FH, 1.0), 0.0)


class TestReuseAfterOcclusion(unittest.TestCase):
    def setUp(self) -> None:
        self.query = _query_emb()
        floor = face_thresholds.reuse_min_similarity()
        margin = face_thresholds.reuse_min_margin()
        # Hai khuôn mặt đều vượt sàn nhưng cách nhau chưa tới nửa ngưỡng cách biệt.
        self.best = _emb_with_similarity(min(0.99, floor + margin * 0.9))
        self.rival = _emb_with_similarity(min(0.98, floor + margin * 0.4))

        q = np.asarray(self.query)
        self.assertGreaterEqual(embedding_similarity(q, np.asarray(self.best)), floor)
        self.assertGreaterEqual(embedding_similarity(q, np.asarray(self.rival)), floor)
        self.assertLess(
            embedding_similarity(q, np.asarray(self.best))
            - embedding_similarity(q, np.asarray(self.rival)),
            margin,
            "kịch bản phải là cách biệt KHÔNG đủ, nếu không test vô nghĩa",
        )

    def test_reuses_id_when_position_corroborates(self):
        """Người bị che rồi hiện lại cách chỗ cũ một quãng — cổng bbox cũ trượt hẳn.

        Đây đúng là khe hở làm sinh mã mới: chồng lấn về 0, khoảng cách tâm vượt
        ngưỡng cố định, mà cách biệt khuôn mặt thì đám đông kéo xuống dưới ngưỡng.
        """
        state = _state_with(
            {
                "HC-01|ptk0001:person": _meta(
                    "sgc-00000001", [600.0, 300.0, 720.0, 600.0], self.best, 3.0,
                ),
                "HC-01|ptk0002:person": _meta(
                    "sgc-00000002", [80.0, 320.0, 200.0, 620.0], self.rival, 3.0,
                ),
            },
        )
        reused = _find_reusable_worker_id(
            state,
            "HC-01",
            [800.0, 300.0, 920.0, 600.0],
            frame_w=FW,
            frame_h=FH,
            face_emb=np.asarray(self.query),
        )
        self.assertEqual(reused, "sgc-00000001")

    def test_no_reuse_when_candidates_are_equally_far(self):
        """Hai ứng viên cách đều hai bên — vị trí không phân định được thì đừng đoán."""
        state = _state_with(
            {
                "HC-01|ptk0001:person": _meta(
                    "sgc-00000001", [600.0, 300.0, 720.0, 600.0], self.best, 3.0,
                ),
                "HC-01|ptk0002:person": _meta(
                    "sgc-00000002", [1000.0, 300.0, 1120.0, 600.0], self.rival, 3.0,
                ),
            },
        )
        reused = _find_reusable_worker_id(
            state,
            "HC-01",
            [800.0, 300.0, 920.0, 600.0],
            frame_w=FW,
            frame_h=FH,
            face_emb=np.asarray(self.query),
        )
        self.assertIsNone(reused)

    def test_no_reuse_when_best_candidate_is_far_away(self):
        """Ứng viên hợp mặt nhất lại ở góc đối diện — không có căn cứ nào để gộp."""
        state = _state_with(
            {
                "HC-01|ptk0001:person": _meta(
                    "sgc-00000001", [40.0, 40.0, 160.0, 340.0], self.best, 3.0,
                ),
                "HC-01|ptk0002:person": _meta(
                    "sgc-00000002", [1100.0, 380.0, 1240.0, 700.0], self.rival, 3.0,
                ),
            },
        )
        reused = _find_reusable_worker_id(
            state,
            "HC-01",
            [600.0, 300.0, 720.0, 600.0],
            frame_w=FW,
            frame_h=FH,
            face_emb=np.asarray(self.query),
        )
        self.assertIsNone(reused)

    def test_clear_face_margin_still_reuses_without_position(self):
        """Cách biệt khuôn mặt đủ lớn thì mặt tự nó là căn cứ, không cần vị trí."""
        state = _state_with(
            {
                "HC-01|ptk0001:person": _meta(
                    "sgc-00000001", [40.0, 40.0, 160.0, 340.0], _query_emb(), 3.0,
                ),
            },
        )
        reused = _find_reusable_worker_id(
            state,
            "HC-01",
            [600.0, 300.0, 720.0, 600.0],
            frame_w=FW,
            frame_h=FH,
            face_emb=np.asarray(self.query),
        )
        self.assertEqual(reused, "sgc-00000001")


if __name__ == "__main__":
    unittest.main()
