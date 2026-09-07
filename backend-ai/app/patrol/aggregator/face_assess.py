"""Face assess thưa trên track ACTIVE — aggregator owns YuNet, không per-frame analyzer."""

from __future__ import annotations

import logging

from ...config import settings
from .identity_pipeline import _note_best_frame
from .types import ObservationInput, TrackSession

logger = logging.getLogger("patrol.aggregator.face_assess")


def _face_assess_interval() -> float:
    return float(getattr(settings, "patrol_face_assess_interval_sec", 0.3) or 0.3)


def enrich_observation_face(session: TrackSession, obs: ObservationInput) -> ObservationInput:
    """Chạy YuNet theo throttle; trả obs có thể đã gắn embedding/quality."""
    if session.is_abandoned():
        return obs
    if not session.can_assess_face(obs.ts, _face_assess_interval()):
        return obs
    if obs.frame is None or obs.person_bbox is None:
        return obs

    session.last_face_assess_at = obs.ts
    try:
        from ...worker_identity.recognizer import assess_patrol_face

        bbox = [float(v) for v in obs.person_bbox]
        vec, score, eligible = assess_patrol_face(
            obs.frame, bbox, camera_id=obs.camera_id,
        )
        emb = tuple(float(x) for x in vec.tolist()) if vec is not None else None
        enriched = ObservationInput(
            camera_id=obs.camera_id,
            track_id=obs.track_id,
            ts=obs.ts,
            person_bbox=obs.person_bbox,
            zone_id=obs.zone_id,
            face_embedding=emb,
            face_quality=float(score or 0.0),
            face_eligible=bool(eligible),
            confidence=obs.confidence,
            frame=obs.frame,
            lifecycle_tier=obs.lifecycle_tier,
            lifecycle_worker_id=obs.lifecycle_worker_id,
            worker_name=obs.worker_name,
            touched_object_id=obs.touched_object_id,
            density_only=obs.density_only,
        )
        _note_best_frame(session, enriched)
        return enriched
    except Exception:  # noqa: BLE001
        logger.debug("face assess skip", exc_info=True)
        return obs
