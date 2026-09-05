"""Snapshot tier overlay đồng bộ tab Người khi score đủ."""
from __future__ import annotations

import tempfile
import unittest
from unittest.mock import patch

import numpy as np

from app.patrol import daystore, identity, sink


class PatrolSnapshotTierSyncTests(unittest.TestCase):
    def setUp(self) -> None:
        self._tmpdir = tempfile.TemporaryDirectory()
        self._patch = patch.object(sink, "SNAPSHOT_DIR", self._tmpdir.name)
        self._patch.start()
        with patch.object(identity, "get_person", return_value=None):
            self._out = sink._write_snapshot(
                "tk-0000008",
                np.zeros((540, 960, 3), dtype=np.uint8),
                (100.0, 80.0, 400.0, 500.0),
                score=daystore.PERSON_LIST_MIN_SNAPSHOT_SCORE + 0.5,
                face_eligible=False,
                tier="object",
            )

    def tearDown(self) -> None:
        self._patch.stop()
        self._tmpdir.cleanup()

    def test_person_score_draws_sky_not_object(self) -> None:
        self.assertIsNotNone(self._out)
        import cv2

        img_path = self._tmpdir.name + "/" + self._out
        img = cv2.imread(img_path)
        self.assertIsNotNone(img)
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        # person tier = orange-400 (#fb923c), không phải xanh identity
        orange = cv2.inRange(hsv, (5, 50, 80), (28, 255, 255))
        green = cv2.inRange(hsv, (35, 40, 80), (90, 255, 255))
        self.assertGreater(int(orange.sum()), int(green.sum()))


if __name__ == "__main__":
    unittest.main()
