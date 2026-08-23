"""API Module 05 — chỉ camera HC-* và sự kiện PPE tuần tra."""

from __future__ import annotations

import time
from typing import Any

from fastapi import HTTPException

PATROL_CAMERA_PREFIX = "HC-"
PATROL_PPE_PREFIX = "PPE"
PATROL_PERS_PREFIX = "PERS"
PATROL_MOBILE_METRICS_TTL_SEC = 20.0
# Flip cam / AI pause: vẫn coi stream online trong grace này
PATROL_MOBILE_ONLINE_GRACE_SEC = 45.0
# Giữ peak person_count sau khi cam tắt (báo cáo cộng dồn phiên)
PATROL_MOBILE_PEAK_TTL_SEC = 3600.0

_patrol_mobile_metrics: dict[str, dict[str, Any]] = {}
_patrol_gps: dict[str, dict[str, Any]] = {}
PATROL_GPS_TTL_SEC = 30.0


def is_patrol_camera_id(camera_id: str) -> bool:
    return camera_id.startswith(PATROL_CAMERA_PREFIX)


def is_patrol_ppe_event(event) -> bool:
    scenario_id = getattr(event, "scenario_id", None) or ""
    camera_id = getattr(event, "camera_id", None) or ""
    return camera_id.startswith(PATROL_CAMERA_PREFIX) and scenario_id.startswith(PATROL_PPE_PREFIX)


def is_patrol_person_event(event) -> bool:
    scenario_id = getattr(event, "scenario_id", None) or ""
    camera_id = getattr(event, "camera_id", None) or ""
    return camera_id.startswith(PATROL_CAMERA_PREFIX) and scenario_id.startswith(PATROL_PERS_PREFIX)


def is_patrol_module_event(event) -> bool:
    return is_patrol_ppe_event(event) or is_patrol_person_event(event)


def today_iso_date() -> str:
    from .events import _event_date

    return _event_date()


def update_patrol_gps(
    camera_id: str,
    gps_lat: float | None,
    gps_lng: float | None,
    *,
    heading: float | None = None,
    pitch: float | None = None,
    roll: float | None = None,
) -> None:
    """GPS (+ optional heading) từ mobile frame — gắn sự kiện PPE HC-*."""
    if not is_patrol_camera_id(camera_id):
        return
    if gps_lat is None or gps_lng is None:
        # Heading-only update
        if heading is None and pitch is None and roll is None:
            return
        from .workforce_engine import workforce_engine
        workforce_engine.update_helmet(
            camera_id,
            heading=heading,
            pitch=pitch,
            roll=roll,
            online=True,
        )
        return
    try:
        lat = float(gps_lat)
        lng = float(gps_lng)
    except (TypeError, ValueError):
        return
    if not (-90.0 <= lat <= 90.0 and -180.0 <= lng <= 180.0):
        return
    if lat == 0.0 and lng == 0.0:
        return
    entry: dict[str, Any] = {
        "gps_lat": lat,
        "gps_lng": lng,
        "updated_at": time.time(),
    }
    if heading is not None:
        try:
            entry["heading"] = float(heading) % 360.0
        except (TypeError, ValueError):
            pass
    if pitch is not None:
        try:
            entry["pitch"] = float(pitch)
        except (TypeError, ValueError):
            pass
    if roll is not None:
        try:
            entry["roll"] = float(roll)
        except (TypeError, ValueError):
            pass
    _patrol_gps[camera_id] = entry
    try:
        from .workforce_engine import workforce_engine
        workforce_engine.update_helmet(
            camera_id,
            lat=lat,
            lon=lng,
            heading=entry.get("heading"),
            pitch=entry.get("pitch"),
            roll=entry.get("roll"),
            online=True,
        )
    except Exception:
        pass


def get_patrol_gps(camera_id: str) -> tuple[float | None, float | None]:
    entry = _patrol_gps.get(camera_id)
    if not entry:
        return None, None
    if (time.time() - float(entry.get("updated_at") or 0)) > PATROL_GPS_TTL_SEC:
        return None, None
    return entry.get("gps_lat"), entry.get("gps_lng")


def get_patrol_heading(camera_id: str) -> float | None:
    entry = _patrol_gps.get(camera_id)
    if not entry:
        return None
    if (time.time() - float(entry.get("updated_at") or 0)) > PATROL_GPS_TTL_SEC:
        return None
    h = entry.get("heading")
    return float(h) if h is not None else None


def patrol_gps_payload(camera_id: str) -> dict[str, Any]:
    lat, lng = get_patrol_gps(camera_id)
    heading = get_patrol_heading(camera_id)
    if lat is None or lng is None:
        return {"gps_lat": None, "gps_lng": None, "heading": heading}
    return {"gps_lat": lat, "gps_lng": lng, "heading": heading}


def update_patrol_mobile_metrics(camera_id: str, result: dict) -> None:
    """Cache metrics từ POST /analyze/frame (HC-02 mobile).

    person_count là peak phiên (cộng dồn) — không giảm khi frame trống / flip cam.
    """
    if not is_patrol_camera_id(camera_id):
        return
    detections = result.get("detections") or []
    metrics = result.get("metrics") or {}
    persons = [row for row in detections if row.get("behavior") == "person"]
    violations = [
        row
        for row in detections
        if row.get("behavior") in ("no_helmet", "no_vest", "no_shoes")
    ]
    worker_names: list[str] = []
    identified_workers = 0
    for person in persons:
        worker_id = person.get("worker_id")
        worker_name = person.get("worker_name")
        from .person_identity_registry import is_identified_gallery_worker

        if is_identified_gallery_worker(worker_id):
            identified_workers += 1
        if isinstance(worker_name, str) and worker_name.strip() and is_identified_gallery_worker(worker_id):
            worker_names.append(worker_name.strip())

    frame_person = int(metrics.get("person_count") or len(persons))
    prev = _patrol_mobile_metrics.get(camera_id) or {}
    peak_person = max(int(prev.get("person_count") or 0), frame_person)
    peak_identified = max(int(prev.get("identified_workers") or 0), identified_workers)
    merged_names = list(
        dict.fromkeys([*(prev.get("worker_names") or []), *worker_names]),
    )[:5]

    _patrol_mobile_metrics[camera_id] = {
        "person_count": peak_person,
        "ppe_violations": int(metrics.get("ppe_violations") or len(violations)),
        "identified_workers": peak_identified,
        "worker_names": merged_names,
        "updated_at": time.time(),
        "last_frame_at": time.time(),
    }

    # Workforce heatmap engines (observability / objects / population / events)
    try:
        from .workforce_engine import ingest_patrol_analyze_result

        lat, lng = get_patrol_gps(camera_id)
        heading = get_patrol_heading(camera_id)
        wf = ingest_patrol_analyze_result(
            camera_id,
            result,
            gps_lat=lat,
            gps_lng=lng,
            heading=heading,
        )
        if wf and isinstance(result, dict):
            result["workforce"] = wf
    except Exception:
        pass


def _metrics_from_vms_overlay(overlay: dict) -> dict[str, Any]:
    stream_online = bool(overlay.get("stream_online"))
    if not stream_online:
        return {
            "stream_online": False,
            "person_count": 0,
            "ppe_violations": 0,
            "identified_workers": 0,
            "worker_names": [],
        }

    ppe_metrics = (overlay.get("metrics") or {}).get("ppe") or {}
    detections = overlay.get("detections") or []
    persons = [row for row in detections if row.get("behavior") == "person"]
    violations = [
        row
        for row in detections
        if row.get("behavior") in ("no_helmet", "no_vest", "no_shoes")
    ]
    worker_names: list[str] = []
    identified_workers = 0
    for person in persons:
        from .person_identity_registry import is_identified_gallery_worker

        if is_identified_gallery_worker(person.get("worker_id")):
            identified_workers += 1
        name = person.get("worker_name")
        if isinstance(name, str) and name.strip() and is_identified_gallery_worker(person.get("worker_id")):
            worker_names.append(name.strip())

    return {
        "stream_online": True,
        "person_count": int(ppe_metrics.get("person_count") or len(persons)),
        "ppe_violations": int(ppe_metrics.get("ppe_violations") or len(violations)),
        "identified_workers": identified_workers,
        "worker_names": list(dict.fromkeys(worker_names))[:5],
    }


def build_patrol_metrics_payload(
    camera_id: str,
    *,
    store,
    vms_workers: dict,
) -> dict[str, Any]:
    if not is_patrol_camera_id(camera_id):
        raise HTTPException(status_code=400, detail="Chỉ hỗ trợ camera HC-* (Module 05)")

    target_date = today_iso_date()
    ppe_alerts_today = len([
        event
        for event in store.list_events(limit=500, date=target_date, camera_id=camera_id)
        if is_patrol_ppe_event(event)
    ])

    worker = vms_workers.get(camera_id)
    if worker is not None:
        live = _metrics_from_vms_overlay(worker.get_latest_overlay())
        return {
            "camera_id": camera_id,
            "backend_reachable": True,
            **live,
            **patrol_gps_payload(camera_id),
            "ppe_alerts_today": ppe_alerts_today,
        }

    cached = _patrol_mobile_metrics.get(camera_id)
    if cached:
        age = time.time() - float(cached.get("updated_at") or cached.get("last_frame_at") or 0)
        stream_online = age <= PATROL_MOBILE_ONLINE_GRACE_SEC
        keep_peak = age <= PATROL_MOBILE_PEAK_TTL_SEC
        if stream_online or keep_peak:
            return {
                "camera_id": camera_id,
                "backend_reachable": True,
                "stream_online": stream_online,
                "person_count": int(cached.get("person_count") or 0) if keep_peak else 0,
                "ppe_violations": int(cached.get("ppe_violations") or 0) if stream_online else 0,
                "identified_workers": int(cached.get("identified_workers") or 0) if keep_peak else 0,
                "worker_names": list(cached.get("worker_names") or []) if keep_peak else [],
                **patrol_gps_payload(camera_id),
                "ppe_alerts_today": ppe_alerts_today,
            }

    return {
        "camera_id": camera_id,
        "backend_reachable": True,
        "stream_online": False,
        "person_count": 0,
        "ppe_violations": 0,
        "identified_workers": 0,
        "worker_names": [],
        **patrol_gps_payload(camera_id),
        "ppe_alerts_today": ppe_alerts_today,
    }


def build_patrol_events_payload(
    camera_id: str,
    *,
    store,
    date: str | None = None,
    limit: int = 500,
) -> list[dict]:
    if not is_patrol_camera_id(camera_id):
        raise HTTPException(status_code=400, detail="Chỉ hỗ trợ camera HC-* (Module 05)")

    target_date = date or today_iso_date()
    events = store.list_events(limit=limit, date=target_date, camera_id=camera_id)
    patrol_rows = [
        event for event in events
        if is_patrol_module_event(event) and getattr(event, "snapshot_file", None)
    ]
    return [event.model_dump() for event in patrol_rows]


def build_patrol_aggregate_metrics_payload(
    camera_ids: list[str],
    *,
    store,
    vms_workers: dict,
) -> dict[str, Any]:
    valid_ids = [cam_id for cam_id in camera_ids if is_patrol_camera_id(cam_id)]
    if not valid_ids:
        raise HTTPException(status_code=400, detail="Cần ít nhất một camera HC-*")

    per_camera: list[dict[str, Any]] = []
    total_person = 0
    total_violations = 0
    total_identified = 0
    total_ppe_alerts = 0
    all_names: list[str] = []
    any_online = False

    for cam_id in valid_ids:
        payload = build_patrol_metrics_payload(
            cam_id,
            store=store,
            vms_workers=vms_workers,
        )
        per_camera.append(
            {
                "camera_id": cam_id,
                "stream_online": payload["stream_online"],
                "person_count": payload["person_count"],
                "ppe_violations": payload["ppe_violations"],
                "identified_workers": payload["identified_workers"],
                "ppe_alerts_today": payload["ppe_alerts_today"],
                "gps_lat": payload.get("gps_lat"),
                "gps_lng": payload.get("gps_lng"),
            },
        )
        total_ppe_alerts += int(payload["ppe_alerts_today"])
        all_names.extend(payload.get("worker_names") or [])
        # Cộng dồn person kể cả khi cam vừa flip / temporarily offline
        total_person += int(payload["person_count"])
        total_identified += int(payload["identified_workers"])
        if payload["stream_online"]:
            any_online = True
            total_violations += int(payload["ppe_violations"])

    return {
        "cameras": per_camera,
        "backend_reachable": True,
        "stream_online": any_online,
        "person_count": total_person,
        "ppe_violations": total_violations,
        "identified_workers": total_identified,
        "worker_names": list(dict.fromkeys(all_names))[:8],
        "ppe_alerts_today": total_ppe_alerts,
    }


def build_patrol_aggregate_events_payload(
    camera_ids: list[str],
    *,
    store,
    date: str | None = None,
    limit: int = 500,
) -> list[dict]:
    valid_ids = [cam_id for cam_id in camera_ids if is_patrol_camera_id(cam_id)]
    if not valid_ids:
        raise HTTPException(status_code=400, detail="Cần ít nhất một camera HC-*")

    target_date = date or today_iso_date()
    per_cam_limit = max(limit // len(valid_ids), 50)
    merged: list = []
    for cam_id in valid_ids:
        merged.extend(
            build_patrol_events_payload(
                cam_id,
                store=store,
                date=target_date,
                limit=per_cam_limit,
            ),
        )
    merged.sort(key=lambda row: float(row.get("created_at") or 0), reverse=True)
    return merged[:limit]
