"""Borrow worker_id từ mũ khác khi cùng embedding."""

from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.person_identity_registry import (  # noqa: E402
    _expected_emb_dim,
    borrow_cross_camera_patrol_worker,
)


def _query_emb() -> list[float]:
    dim = _expected_emb_dim()
    vec = np.zeros(dim, dtype=np.float64)
    vec[0] = 1.0
    return vec.tolist()


class TestBorrowCrossCameraPatrolWorker(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self._reg_file = Path(self._tmpdir.name) / "person_identity_registry.json"
        self._reg_file.write_text(
            json.dumps({
                "next_seq": 5,
                "tracks": {},
                "track_meta": {
                    "HC-01|ptk0001:person": {
                        "worker_id": "sgc-00000430",
                        "bbox": [600.0, 300.0, 720.0, 600.0],
                        "face_emb": _query_emb(),
                        "updated_at": __import__("time").time(),
                    },
                },
            }),
            encoding="utf-8",
        )
        self._patches = [
            patch("app.person_identity_registry.REGISTRY_FILE", self._reg_file),
            patch("app.person_identity_registry._state", None),
        ]
        for p in self._patches:
            p.start()
        self.frame = np.zeros((720, 480, 3), dtype=np.uint8)

    def tearDown(self) -> None:
        for p in reversed(self._patches):
            p.stop()
        self._tmpdir.cleanup()

    def test_borrow_sgc_from_sibling_helmet(self) -> None:
        borrowed = borrow_cross_camera_patrol_worker(
            "HC-02",
            [100.0, 200.0, 240.0, 560.0],
            frame=self.frame,
            frame_w=480,
            frame_h=720,
            face_emb=_query_emb(),
        )
        self.assertIsNotNone(borrowed)
        wid, _name = borrowed  # type: ignore[misc]
        self.assertEqual(wid, "sgc-00000430")


if __name__ == "__main__":
    unittest.main()
