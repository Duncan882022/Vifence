"""Chế độ bay flycam — tầm cao (mật độ) vs tầm thấp (AI như mũ, góc rộng)."""

from __future__ import annotations

import time
from enum import Enum

from .config import settings

PATROL_FLIGHT_MODE_AERIAL = "aerial"
PATROL_FLIGHT_MODE_PROXIMITY = "proximity"


class PatrolFlightMode(str, Enum):
    AERIAL = PATROL_FLIGHT_MODE_AERIAL
    PROXIMITY = PATROL_FLIGHT_MODE_PROXIMITY


_mode_state: dict[str, dict[str, object]] = {}
_altitude_state: dict[str, dict[str, float]] = {}
_visual_scale_state: dict[str, dict[str, float]] = {}

# Người > ~4% chiều cao khung → drone đang bay thấp (aerial thường 1–2%).
_VISUAL_PROXIMITY_BH_RATIO = 0.040
_VISUAL_SCALE_TTL_SEC = 4.0


def note_patrol_flycam_visual_scale(
    camera_id: str,
    person_boxes: list[tuple[float, float, float, float]],
    frame_h: int,
) -> None:
    """Cập nhật gợi ý tầm thấp từ kích thước bbox YOLO khi thiếu telemetry độ cao."""
    if not camera_id.startswith("DR-") or frame_h <= 0 or not person_boxes:
        return
    max_bh = 0.0
    for box in person_boxes:
        _x1, y1, _x2, y2 = box
        max_bh = max(max_bh, max(y2 - y1, 0.0) / float(frame_h))
    if max_bh <= 0.0:
        return
    _visual_scale_state[camera_id] = {
        "max_bh_ratio": max_bh,
        "updated_at": time.time(),
    }


def _visual_scale_suggests_proximity(camera_id: str) -> bool:
    entry = _visual_scale_state.get(camera_id)
    if not entry:
        return False
    age = time.time() - float(entry.get("updated_at") or 0)
    if age > _VISUAL_SCALE_TTL_SEC:
        return False
    return float(entry.get("max_bh_ratio") or 0.0) >= _VISUAL_PROXIMITY_BH_RATIO


def _parse_altitude_overrides(raw: str) -> dict[str, float]:
    out: dict[str, float] = {}
    for part in raw.split(","):
        part = part.strip()
        if not part or ":" not in part:
            continue
        cam, alt = part.split(":", 1)
        cam = cam.strip().upper()
        try:
            out[cam] = float(alt.strip())
        except ValueError:
            continue
    return out


def update_patrol_drone_altitude(
    camera_id: str,
    altitude_m: float | None,
    *,
    lat: float | None = None,
    lng: float | None = None,
    heading: float | None = None,
) -> None:
    """Telemetry độ cao flycam — quyết định aerial (mật độ) vs proximity (AI)."""
    if not camera_id.startswith("DR-"):
        return
    if altitude_m is None:
        return
    try:
        alt = float(altitude_m)
    except (TypeError, ValueError):
        return
    if alt < 0 or alt > 5000:
        return

    _altitude_state[camera_id] = {
        "altitude_m": alt,
        "updated_at": time.time(),
    }
    if lat is not None and lng is not None:
        from .patrol_runtime import update_patrol_drone_gps

        update_patrol_drone_gps(camera_id, lat, lng, heading=heading)


def get_patrol_drone_altitude_m(camera_id: str) -> float | None:
    entry = _altitude_state.get(camera_id)
    if entry:
        age = time.time() - float(entry.get("updated_at") or 0)
        if age <= settings.patrol_drone_altitude_ttl_sec:
            return float(entry["altitude_m"])

    overrides = _parse_altitude_overrides(settings.patrol_drone_altitude_overrides)
    if camera_id.upper() in overrides:
        return overrides[camera_id.upper()]
    return settings.patrol_drone_default_altitude_m


def resolve_patrol_flight_mode(camera_id: str) -> PatrolFlightMode:
    """Tầm cao → chỉ mật độ; tầm thấp → AI như mũ (gate rộng hơn)."""
    if not camera_id.startswith("DR-"):
        return PatrolFlightMode.PROXIMITY

    alt = get_patrol_drone_altitude_m(camera_id)
    aerial_min = float(settings.patrol_flycam_aerial_min_m)
    proximity_max = float(settings.patrol_flycam_proximity_max_m)

    prev = _mode_state.get(camera_id, {}).get("mode")
    if alt is None:
        if _visual_scale_suggests_proximity(camera_id):
            mode = PatrolFlightMode.PROXIMITY
        else:
            mode = PatrolFlightMode.AERIAL
    elif alt >= aerial_min:
        mode = PatrolFlightMode.AERIAL
    elif alt <= proximity_max:
        mode = PatrolFlightMode.PROXIMITY
    elif prev in (PATROL_FLIGHT_MODE_AERIAL, PATROL_FLIGHT_MODE_PROXIMITY):
        mode = PatrolFlightMode(str(prev))
    else:
        mode = PatrolFlightMode.AERIAL

    _mode_state[camera_id] = {"mode": mode.value, "altitude_m": alt, "updated_at": time.time()}
    return mode


def is_patrol_flycam_aerial(camera_id: str) -> bool:
    return camera_id.startswith("DR-") and resolve_patrol_flight_mode(camera_id) == PatrolFlightMode.AERIAL


def is_patrol_flycam_proximity(camera_id: str) -> bool:
    return camera_id.startswith("DR-") and resolve_patrol_flight_mode(camera_id) == PatrolFlightMode.PROXIMITY


def is_patrol_helmet_like(camera_id: str) -> bool:
    """HC-* luôn; DR-* tầm thấp — cùng pipeline AI/gate/sự kiện với mũ."""
    if camera_id.startswith("HC-"):
        return True
    if camera_id.startswith("DR-"):
        return is_patrol_flycam_proximity(camera_id)
    return False


def patrol_flight_mode_payload(camera_id: str) -> dict[str, object]:
    mode = resolve_patrol_flight_mode(camera_id)
    alt = get_patrol_drone_altitude_m(camera_id)
    return {
        "flight_mode": mode.value,
        "altitude_m": alt,
    }
