"""Embedding mặt SFace — thay histogram độ sáng vốn không phân biệt được người."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.worker_identity import face_thresholds  # noqa: E402
from app.worker_identity.face_embedder import (  # noqa: E402
    HISTOGRAM_EMBED_DIM,
    SFACE_EMBED_DIM,
    embed_face_image,
    is_deep_face_model_ready,
)
from app.worker_identity.gallery import (  # noqa: E402
    _face_embedding,
    _histogram_embedding,
    embedding_similarity,
    match_embedding,
)
from app.worker_identity.models import WorkerProfile  # noqa: E402


def _noise_image(seed: int, size: int = 120) -> np.ndarray:
    rng = np.random.default_rng(seed)
    return rng.integers(0, 255, (size, size, 3), dtype=np.uint8)


class DeepFaceEmbeddingTests(unittest.TestCase):
    def test_model_available(self) -> None:
        self.assertTrue(
            is_deep_face_model_ready(),
            "Thiếu face_recognition_sface_2021dec.onnx — patrol sẽ lùi về histogram",
        )

    def test_embedding_shape_and_norm(self) -> None:
        emb = embed_face_image(_noise_image(1))
        self.assertIsNotNone(emb)
        self.assertEqual(len(emb), SFACE_EMBED_DIM)
        self.assertAlmostEqual(float(np.linalg.norm(emb)), 1.0, places=4)

    def test_embedding_is_deterministic(self) -> None:
        image = _noise_image(2)
        self.assertTrue(np.allclose(embed_face_image(image), embed_face_image(image)))

    def test_gallery_embedding_prefers_deep_model(self) -> None:
        self.assertEqual(len(_face_embedding(_noise_image(3))), SFACE_EMBED_DIM)

    def test_gallery_embedding_falls_back_to_histogram(self) -> None:
        with patch("app.worker_identity.face_embedder.embed_face_image", return_value=None):
            self.assertEqual(len(_face_embedding(_noise_image(4))), HISTOGRAM_EMBED_DIM)


class EmbeddingSpaceGuardTests(unittest.TestCase):
    def test_similarity_zero_across_embedding_spaces(self) -> None:
        deep = embed_face_image(_noise_image(5))
        hist = _histogram_embedding(_noise_image(5))
        self.assertNotEqual(len(deep), len(hist))
        self.assertEqual(embedding_similarity(deep, hist), 0.0)

    def test_registry_rejects_stale_dimension(self) -> None:
        from app.person_identity_registry import _as_emb

        stale = [0.1] * HISTOGRAM_EMBED_DIM
        fresh = [0.1] * SFACE_EMBED_DIM
        self.assertIsNone(_as_emb(stale))
        self.assertIsNotNone(_as_emb(fresh))


class FaceThresholdTests(unittest.TestCase):
    def test_deep_thresholds_active_with_model(self) -> None:
        # Thang SFace thấp hơn histogram — dùng nhầm thang cũ thì không bao giờ khớp.
        self.assertLess(face_thresholds.gallery_min_confidence("HC-02"), 0.7)
        self.assertLess(face_thresholds.reuse_min_similarity(), 0.7)
        self.assertLess(
            face_thresholds.split_max_similarity(),
            face_thresholds.reuse_min_similarity(),
        )

    def test_patrol_stricter_than_fixed_camera(self) -> None:
        self.assertGreaterEqual(
            face_thresholds.gallery_min_confidence("HC-02"),
            face_thresholds.gallery_min_confidence("A-04"),
        )

    def test_histogram_thresholds_when_model_missing(self) -> None:
        with patch(
            "app.worker_identity.face_thresholds.is_deep_face_model_ready",
            return_value=False,
        ):
            self.assertGreaterEqual(face_thresholds.gallery_min_confidence("HC-02"), 0.7)


class GalleryMarginTests(unittest.TestCase):
    """Nhiều pose của cùng công nhân không được coi là ứng viên cạnh tranh."""

    @staticmethod
    def _profile(worker_id: str) -> WorkerProfile:
        return WorkerProfile(
            worker_id=worker_id,
            worker_name=worker_id,
            employee_code=worker_id,
            contractor_name=None,
        )

    def test_same_worker_poses_do_not_block_match(self) -> None:
        query = np.zeros(SFACE_EMBED_DIM)
        query[0] = 1.0
        near = np.zeros(SFACE_EMBED_DIM)
        near[0], near[1] = 0.99, 0.14
        registry = [
            (self._profile("p-trung"), query.copy()),
            (self._profile("p-trung"), near),
        ]
        with patch("app.worker_identity.gallery._REGISTRY", registry):
            matched = match_embedding(query, min_confidence=0.5, min_margin=0.08)
        self.assertIsNotNone(matched)
        self.assertEqual(matched[0].worker_id, "p-trung")

    def test_two_close_workers_rejected_by_margin(self) -> None:
        query = np.zeros(SFACE_EMBED_DIM)
        query[0] = 1.0
        rival = np.zeros(SFACE_EMBED_DIM)
        rival[0], rival[1] = 0.99, 0.14
        registry = [
            (self._profile("p-trung"), query.copy()),
            (self._profile("p-khac"), rival),
        ]
        with patch("app.worker_identity.gallery._REGISTRY", registry):
            matched = match_embedding(query, min_confidence=0.5, min_margin=0.08)
        self.assertIsNone(matched)


if __name__ == "__main__":
    unittest.main()
