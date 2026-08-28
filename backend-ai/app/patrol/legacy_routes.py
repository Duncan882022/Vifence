"""Patrol legacy routes — metrics/workforce/identity (tách khỏi main.py)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse

from ..auth import RequirePatrolHr, RequirePatrolRead
from ..schemas import PatrolIdentityAssignPayload
from ..patrol_runtime import (
    build_patrol_aggregate_events_payload,
    build_patrol_aggregate_metrics_payload,
    build_patrol_events_payload,
    build_patrol_live_bundle_payload,
    build_patrol_metrics_payload,
    assign_patrol_identity,
    list_patrol_appearances_payload,
    merge_workforce_snapshots,
)
from ..workforce_engine import workforce_engine

router = APIRouter(prefix="/patrol", tags=["patrol-legacy"])

_store: Any = None
_vms_workers: dict[str, Any] = {}


def init_legacy_ctx(*, store: Any, vms_workers: dict[str, Any]) -> None:
    global _store, _vms_workers
    _store = store
    _vms_workers = vms_workers


@router.get("/metrics")
def patrol_aggregate_metrics(
    cameras: str = "HC-01,HC-02",
    _user: RequirePatrolRead = None,  # noqa: ARG001
):
    camera_ids = [cam.strip() for cam in cameras.split(",") if cam.strip()]
    return build_patrol_aggregate_metrics_payload(
        camera_ids,
        store=_store,
        vms_workers=_vms_workers,
    )


@router.get("/live/bundle")
def patrol_live_bundle(
    cameras: str = "HC-01,HC-02",
    _user: RequirePatrolRead = None,  # noqa: ARG001
):
    """Metrics + workforce — một round-trip cho Module 05 live poll."""
    camera_ids = [cam.strip() for cam in cameras.split(",") if cam.strip()]
    return build_patrol_live_bundle_payload(
        camera_ids,
        store=_store,
        vms_workers=_vms_workers,
    )


@router.get("/events")
def patrol_aggregate_events(
    cameras: str = "HC-01,HC-02",
    date: str | None = None,
    limit: int = 500,
    _user: RequirePatrolRead = None,  # noqa: ARG001
):
    camera_ids = [cam.strip() for cam in cameras.split(",") if cam.strip()]
    return build_patrol_aggregate_events_payload(
        camera_ids,
        store=_store,
        date=date,
        limit=limit,
    )


@router.get("/workforce/state")
def patrol_workforce_state(
    cameras: str = "HC-01,HC-02",
    _user: RequirePatrolRead = None,  # noqa: ARG001
):
    camera_ids = [c.strip() for c in cameras.split(",") if c.strip()]
    return merge_workforce_snapshots(camera_ids)


@router.get("/workforce/events")
def patrol_workforce_events(
    limit: int = 50,
    _user: RequirePatrolRead = None,  # noqa: ARG001
):
    snap = workforce_engine.snapshot()
    return (snap.get("events") or [])[: max(1, min(limit, 200))]


@router.get("/identity/bindings")
def patrol_identity_bindings(_user: RequirePatrolRead = None):  # noqa: ARG001
    from ..patrol_identity_store import list_patrol_identity_bindings

    return {"ok": True, "bindings": list_patrol_identity_bindings()}


@router.get("/appearances")
def patrol_appearances(
    master_id: str,
    date: str | None = None,
    _user: RequirePatrolRead = None,  # noqa: ARG001
):
    return list_patrol_appearances_payload(master_id, date=date)


@router.post("/identity/assign")
def patrol_identity_assign(
    payload: PatrolIdentityAssignPayload,
    user: RequirePatrolHr = None,  # noqa: ARG001
):
    result = assign_patrol_identity(payload.model_dump())
    if not result.get("ok"):
        return result
    from .audit import audit

    audit("identity_assign", actor=user.username, subject_id=payload.employee_code)
    return result


@router.get("/{camera_id}/events")
def patrol_helmet_events(
    camera_id: str,
    date: str | None = None,
    limit: int = 500,
    _user: RequirePatrolRead = None,  # noqa: ARG001
):
    return build_patrol_events_payload(
        camera_id,
        store=_store,
        date=date,
        limit=limit,
    )


@router.get("/{camera_id}/metrics")
def patrol_helmet_metrics(
    camera_id: str,
    _user: RequirePatrolRead = None,  # noqa: ARG001
):
    if camera_id.startswith("DR-"):
        from ..drone_heatmap import get_drone_heatmap_metrics

        live = get_drone_heatmap_metrics(camera_id)
        if live.get("updated_at"):
            return live
    return build_patrol_metrics_payload(
        camera_id,
        store=_store,
        vms_workers=_vms_workers,
    )


@router.get("/{camera_id}/heatmap.png")
def patrol_drone_heatmap_png(
    camera_id: str,
    _user: RequirePatrolRead = None,  # noqa: ARG001
):
    if not camera_id.startswith("DR-"):
        raise HTTPException(status_code=404, detail="heatmap_only_for_drone")
    from ..drone_heatmap import get_drone_heatmap_png_path

    path = get_drone_heatmap_png_path(camera_id)
    if path is None:
        raise HTTPException(status_code=404, detail="heatmap_not_ready")
    return FileResponse(path, media_type="image/png")


@router.get("/config/streams")
def patrol_stream_config(_user: RequirePatrolRead = None):  # noqa: ARG001
    """Runtime stream URLs — không hardcode IP trong FE."""
    from ..config import settings

    streams: dict[str, str] = {}
    if settings.hc01_rtsp_url:
        streams["HC-01"] = settings.hc01_rtsp_url
    for cam_id, primary, _fb in settings.vms_camera_entries:
        if cam_id.startswith("HC-") or cam_id.startswith("DR-"):
            streams[cam_id] = primary
    return {"ok": True, "streams": streams}
