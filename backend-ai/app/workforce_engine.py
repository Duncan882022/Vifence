"""
Realtime Workforce Heatmap — Module 05 engines
specs/module05/REALTIME_WORKFORCE_HEATMAP_SPECIFICATION.md
"""
from __future__ import annotations

from .position_engine import fuse_helmet_pose, map_match_position

import math
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Literal

ObservationMode = Literal["FULL_BODY", "UPPER_BODY", "FACE_CLOSEUP", "PARTIAL_BODY"]
IdentityStatus = Literal["UNKNOWN", "VERIFIED", "DEDUPLICATED"]
LiveStatus = Literal["ACTIVE", "RECENTLY_OBSERVED", "EXPIRED"]
ObservabilityBand = Literal["HIGH", "MEDIUM", "LOW"]
EventType = Literal[
    "POPULATION_OBSERVED",
    "POPULATION_CHANGE",
    "HIGH_DENSITY",
    "IDENTITY_VERIFIED",
    "OBJECT_MERGED",
]

EARTH_R = 6_371_000.0
REID_STRICT = 0.92
FACE_VERIFY = 0.90
HEAT_INTERVAL_S = 3.0
# Spec §7.3 — decay alpha ~15s without new observation
HEAT_DECAY_S = 15.0
TTL_ACTIVE_S = 30.0
TTL_RECENT_S = 120.0
DEFAULT_ZONE = "ZONE-A3"
DEFAULT_ZONE_AREA = 400.0
HIGH_DENSITY = 0.8
CD_POP_OBS = 180.0
CD_POP_CHG = 300.0
CD_HIGH_D = 600.0


def _now() -> float:
    return time.time()


def _iso(ts: float | None = None) -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S+07:00", time.localtime(ts or _now()))


def _clamp01(v: float) -> float:
    return max(0.0, min(1.0, float(v)))


def classify_observation_mode(
    bbox: list[float] | tuple[float, ...] | None,
    frame_w: float,
    frame_h: float,
) -> ObservationMode:
    if not bbox or len(bbox) < 4 or frame_w <= 0 or frame_h <= 0:
        return "PARTIAL_BODY"
    x1, y1, x2, y2 = (float(v) for v in bbox[:4])
    if max(abs(x1), abs(y1), abs(x2), abs(y2)) <= 1.5:
        x1, x2 = x1 * frame_w, x2 * frame_w
        y1, y2 = y1 * frame_h, y2 * frame_h
    bw = max(1.0, x2 - x1)
    bh = max(1.0, y2 - y1)
    area_r = (bw * bh) / max(1.0, frame_w * frame_h)
    h_r = bh / frame_h
    aspect = bh / bw
    if area_r >= 0.30 and h_r >= 0.35 and aspect < 1.35:
        return "FACE_CLOSEUP"
    if area_r >= 0.45 and h_r >= 0.55:
        return "FACE_CLOSEUP"
    if area_r < 0.02 or h_r < 0.12:
        return "PARTIAL_BODY"
    if aspect < 0.55 and h_r < 0.35:
        return "PARTIAL_BODY"
    if h_r >= 0.45 and aspect >= 1.6 and area_r < 0.35:
        return "FULL_BODY"
    if h_r >= 0.55 and aspect >= 1.4:
        return "FULL_BODY"
    return "UPPER_BODY"


def mode_counts_population(mode: ObservationMode) -> bool:
    return mode in ("FULL_BODY", "UPPER_BODY")


def mode_allows_position(mode: ObservationMode) -> bool:
    return mode in ("FULL_BODY", "UPPER_BODY")


def compute_observability(
    rows: list[dict[str, Any]],
    frame_w: float,
    frame_h: float,
) -> tuple[float, ObservabilityBand]:
    if frame_w <= 0 or frame_h <= 0:
        return 0.0, "LOW"
    if not rows:
        return 0.72, "MEDIUM"
    crop_scores: list[float] = []
    closeups = 0
    confs: list[float] = []
    for det in rows:
        bbox = det.get("bbox")
        mode = det.get("observation_mode") or classify_observation_mode(bbox, frame_w, frame_h)
        if mode == "FACE_CLOSEUP":
            closeups += 1
        confs.append(float(det.get("confidence") or det.get("score") or 0.5))
        if not bbox or len(bbox) < 4:
            crop_scores.append(0.5)
            continue
        x1, y1, x2, y2 = (float(v) for v in bbox[:4])
        if max(abs(x1), abs(y1), abs(x2), abs(y2)) <= 1.5:
            x1, x2 = x1 * frame_w, x2 * frame_w
            y1, y2 = y1 * frame_h, y2 * frame_h
        margin = 4.0
        cropped = x1 <= margin or y1 <= margin or x2 >= frame_w - margin or y2 >= frame_h - margin
        crop_scores.append(1.0 if cropped else 0.0)
    r_crop = sum(crop_scores) / len(crop_scores)
    r_close = closeups / len(rows)
    s = 0.3 * (1.0 - r_crop) + 0.3 * (1.0 - r_close) + 0.2 * 0.85 + 0.2 * _clamp01(sum(confs) / len(confs))
    s = _clamp01(s)
    if s >= 0.75:
        return s, "HIGH"
    if s >= 0.45:
        return s, "MEDIUM"
    return s, "LOW"


def estimate_distance_m(mode: ObservationMode, bbox: list[float] | None, frame_h: float) -> float | None:
    if not mode_allows_position(mode) or not bbox or frame_h <= 0:
        return None
    _x1, y1, _x2, y2 = (float(v) for v in bbox[:4])
    bh = abs(y2 - y1) * frame_h if max(abs(y1), abs(y2)) <= 1.5 else abs(y2 - y1)
    if bh < 8:
        return None
    scale = 1.0 if mode == "FULL_BODY" else 1.55
    return max(0.8, min(25.0, (900.0 * 1.7 * scale) / bh))


def bearing_from_bbox(bbox: list[float] | None, frame_w: float, heading_deg: float, fov_h: float = 70.0) -> float:
    if not bbox or frame_w <= 0:
        return heading_deg % 360.0
    x1, _y1, x2, _y2 = (float(v) for v in bbox[:4])
    cx = ((x1 + x2) / 2.0) * frame_w if max(abs(x1), abs(x2)) <= 1.5 else (x1 + x2) / 2.0
    delta = ((cx - frame_w / 2.0) / max(1.0, frame_w / 2.0)) * (fov_h / 2.0)
    return (heading_deg + delta) % 360.0


def forward_geodesic(lat: float, lon: float, bearing_deg: float, dist_m: float) -> tuple[float, float]:
    br = math.radians(bearing_deg)
    lat1 = math.radians(lat)
    lon1 = math.radians(lon)
    ang = dist_m / EARTH_R
    lat2 = math.asin(math.sin(lat1) * math.cos(ang) + math.cos(lat1) * math.sin(ang) * math.cos(br))
    lon2 = lon1 + math.atan2(
        math.sin(br) * math.sin(ang) * math.cos(lat1),
        math.cos(ang) - math.sin(lat1) * math.sin(lat2),
    )
    return math.degrees(lat2), (math.degrees(lon2) + 540.0) % 360.0 - 180.0


def position_confidence(mode: ObservationMode, det_conf: float) -> float:
    dc = _clamp01(det_conf)
    if mode == "FULL_BODY":
        return 0.85 * dc
    if mode == "UPPER_BODY":
        return 0.50 * dc
    return 0.0


def lowpass_latlon(prev: tuple[float, float] | None, new: tuple[float, float], mode: ObservationMode) -> tuple[float, float]:
    if prev is None:
        return new
    a = 0.35 if mode == "FULL_BODY" else 0.15
    return a * new[0] + (1 - a) * prev[0], a * new[1] + (1 - a) * prev[1]


@dataclass
class PossibleMatch:
    candidate_object_id: str
    reid_similarity: float
    spatial_temporal_overlap: float = 0.0


@dataclass
class WorkforceObject:
    object_id: str
    helmet_id: str
    track_id: str | None
    first_seen: float
    last_seen: float
    observation_mode: ObservationMode = "FULL_BODY"
    identity_status: IdentityStatus = "UNKNOWN"
    worker_id: str | None = None
    worker_name: str | None = None
    face_confidence: float | None = None
    lat: float | None = None
    lon: float | None = None
    position_confidence: float = 0.0
    possible_matches: list[PossibleMatch] = field(default_factory=list)
    zone_id: str = DEFAULT_ZONE
    detector_confidence: float = 0.0
    last_heat_at: float = 0.0

    def live_status(self, now: float | None = None) -> LiveStatus:
        age = (now or _now()) - self.last_seen
        if age <= TTL_ACTIVE_S:
            return "ACTIVE"
        if age <= TTL_RECENT_S:
            return "RECENTLY_OBSERVED"
        return "EXPIRED"


@dataclass
class HeatPoint:
    lat: float
    lon: float
    weight: float
    timestamp: float
    zone_id: str
    object_id: str


@dataclass
class PopulationObservation:
    zone_id: str
    timestamp: float
    observed_count: int
    observability: float
    band: ObservabilityBand
    full_body_count: int = 0
    upper_body_count: int = 0
    verified_identities: int = 0
    unknown_objects: int = 0
    helmet_references: list[str] = field(default_factory=list)


@dataclass
class WorkforceEvent:
    event_id: str
    event_type: EventType
    zone_id: str
    timestamp: float
    severity: str
    title: str
    description: str
    payload: dict[str, Any]
    helmet_id: str | None = None
    show_in_ui: bool = True


@dataclass
class HelmetPose:
    helmet_id: str
    lat: float | None = None
    lon: float | None = None
    heading: float | None = None
    pitch: float | None = None
    roll: float | None = None
    zone_id: str = DEFAULT_ZONE
    online: bool = False
    updated_at: float = 0.0
    position_method: str = "raw"


class WorkforceEngine:
    def __init__(self) -> None:
        self.helmets: dict[str, HelmetPose] = {}
        self.objects: dict[str, WorkforceObject] = {}
        self.track_to_object: dict[str, str] = {}
        self.population_timeline: dict[str, list[PopulationObservation]] = {}
        self.latest_population: dict[str, PopulationObservation] = {}
        self.events: list[WorkforceEvent] = []
        self.heat_points: list[HeatPoint] = []
        self._cooldown: dict[str, float] = {}
        self._audit: list[dict[str, Any]] = []

    def update_helmet(
        self,
        helmet_id: str,
        *,
        lat: float | None = None,
        lon: float | None = None,
        heading: float | None = None,
        pitch: float | None = None,
        roll: float | None = None,
        online: bool = True,
        zone_id: str | None = None,
        accuracy_m: float | None = None,
    ) -> HelmetPose:
        pose = self.helmets.get(helmet_id) or HelmetPose(helmet_id=helmet_id)
        now = _now()
        fused_lat, fused_lon, fused_heading, method = fuse_helmet_pose(
            helmet_id,
            lat=lat,
            lon=lon,
            heading=heading,
            pitch=pitch,
            roll=roll,
            accuracy_m=accuracy_m,
            ts=now,
        )
        if fused_lat is not None and fused_lon is not None:
            pose.lat, pose.lon = fused_lat, fused_lon
            pose.position_method = method
        elif lat is not None and lon is not None and not (lat == 0 and lon == 0):
            matched_lat, matched_lon = map_match_position(float(lat), float(lon))
            pose.lat, pose.lon = matched_lat, matched_lon
            pose.position_method = "map"
        if fused_heading is not None:
            pose.heading = fused_heading
        elif heading is not None:
            pose.heading = float(heading) % 360.0
        if pitch is not None:
            pose.pitch = float(pitch)
        if roll is not None:
            pose.roll = float(roll)
        pose.online = online
        if zone_id:
            pose.zone_id = zone_id
        pose.updated_at = now
        self.helmets[helmet_id] = pose
        return pose

    def ingest_frame(
        self,
        helmet_id: str,
        detections: list[dict[str, Any]],
        *,
        frame_w: float = 1280.0,
        frame_h: float = 720.0,
        zone_id: str | None = None,
        zone_area_sqm: float = DEFAULT_ZONE_AREA,
    ) -> dict[str, Any]:
        now = _now()
        pose = self.helmets.get(helmet_id) or HelmetPose(helmet_id=helmet_id, online=True)
        pose.online = True
        pose.updated_at = now
        zid = zone_id or pose.zone_id or DEFAULT_ZONE
        pose.zone_id = zid
        self.helmets[helmet_id] = pose

        persons = [
            d for d in detections
            if str(d.get("behavior") or d.get("label") or d.get("class_name") or "").lower()
            in ("person", "người", "person_detected")
        ]
        enriched: list[dict[str, Any]] = []
        for det in persons:
            bbox = det.get("bbox") or det.get("subject_bbox")
            mode = classify_observation_mode(bbox, frame_w, frame_h)
            enriched.append({**det, "observation_mode": mode, "bbox": bbox})

        s_obs, band = compute_observability(enriched, frame_w, frame_h)
        countable = [r for r in enriched if mode_counts_population(r["observation_mode"])]
        frame_count = len(countable)
        full_n = sum(1 for r in countable if r["observation_mode"] == "FULL_BODY")
        upper_n = sum(1 for r in countable if r["observation_mode"] == "UPPER_BODY")

        active_ids: set[str] = set()
        for row in enriched:
            oid = self._upsert_object(helmet_id, row, pose, frame_w, frame_h, zid, now, s_obs)
            if oid:
                active_ids.add(oid)

        verified = sum(
            1 for oid in active_ids
            if (o := self.objects.get(oid)) and o.identity_status == "VERIFIED"
        )
        unknown = len(active_ids) - verified

        if band in ("HIGH", "MEDIUM") and frame_count > 0:
            self._update_population(
                zid,
                observed=frame_count,
                observability=s_obs,
                band=band,
                full_body_count=full_n,
                upper_body_count=upper_n,
                verified_identities=verified,
                unknown_objects=unknown,
                helmet_id=helmet_id,
                zone_area_sqm=zone_area_sqm,
            )

        self._gc(now)
        return {
            "observability": s_obs,
            "observability_band": band,
            "frame_countable": frame_count,
            "active_objects": len(active_ids),
            "population": self._population_payload(zid),
        }

    def _upsert_object(
        self,
        helmet_id: str,
        row: dict[str, Any],
        pose: HelmetPose,
        frame_w: float,
        frame_h: float,
        zone_id: str,
        now: float,
        s_obs: float,
    ) -> str | None:
        mode: ObservationMode = row["observation_mode"]
        bbox = row.get("bbox")
        track_raw = row.get("track_id") or row.get("trackId")
        track_id = str(track_raw).strip() if track_raw else None
        track_key = f"{helmet_id}:{track_id}" if track_id else None

        if mode == "PARTIAL_BODY" and not (track_key and track_key in self.track_to_object):
            return None

        object_id: str | None = None
        if track_key and track_key in self.track_to_object:
            object_id = self.track_to_object[track_key]
        elif track_id:
            for oid, obj in self.objects.items():
                if obj.helmet_id == helmet_id and obj.track_id == track_id and obj.live_status(now) != "EXPIRED":
                    object_id = oid
                    break

        if object_id is None:
            if mode == "FACE_CLOSEUP":
                nearest = self._nearest_active(helmet_id, now)
                object_id = nearest.object_id if nearest else self._new_object_id()
            else:
                object_id = self._new_object_id()

        obj = self.objects.get(object_id)
        if obj is None:
            obj = WorkforceObject(
                object_id=object_id,
                helmet_id=helmet_id,
                track_id=track_id,
                first_seen=now,
                last_seen=now,
                observation_mode=mode,
                zone_id=zone_id,
            )
            self.objects[object_id] = obj
        else:
            obj.last_seen = now
            obj.observation_mode = mode
            obj.zone_id = zone_id
            if track_id:
                obj.track_id = track_id

        if track_key:
            self.track_to_object[track_key] = object_id

        conf = float(row.get("confidence") or row.get("score") or 0.6)
        obj.detector_confidence = conf

        worker_id = row.get("worker_id")
        worker_name = row.get("worker_name")
        face_conf = row.get("face_confidence") or row.get("identity_confidence")
        wid = str(worker_id).strip() if worker_id else ""
        is_gallery = bool(wid) and not wid.startswith("sgc-") and not wid.startswith("OBJ-")
        if worker_name and is_gallery:
            fc = float(face_conf) if face_conf is not None else 0.95
            if fc >= FACE_VERIFY:
                prev = obj.identity_status
                obj.identity_status = "VERIFIED"
                obj.worker_id = wid
                obj.worker_name = str(worker_name)
                obj.face_confidence = fc
                if prev != "VERIFIED":
                    self._emit_identity_verified(obj, zone_id)

        self._maybe_reid_candidate(obj)

        if mode_allows_position(mode) and pose.lat is not None and pose.lon is not None:
            heading = pose.heading if pose.heading is not None else 0.0
            bearing = bearing_from_bbox(bbox, frame_w, heading)
            dist = estimate_distance_m(mode, bbox, frame_h)
            if dist is not None:
                lat2, lon2 = forward_geodesic(pose.lat, pose.lon, bearing, dist)
                lat2, lon2 = map_match_position(lat2, lon2)
                prev_ll = (obj.lat, obj.lon) if obj.lat is not None and obj.lon is not None else None
                lat2, lon2 = lowpass_latlon(prev_ll, (lat2, lon2), mode)
                obj.lat, obj.lon = lat2, lon2
                obj.position_confidence = position_confidence(mode, conf)
                self._sample_heat(obj, s_obs, now)

        return object_id

    def _new_object_id(self) -> str:
        return f"OBJ-{time.strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}"

    def _nearest_active(self, helmet_id: str, now: float) -> WorkforceObject | None:
        cands = [o for o in self.objects.values() if o.helmet_id == helmet_id and o.live_status(now) == "ACTIVE"]
        return max(cands, key=lambda o: o.last_seen) if cands else None

    def _maybe_reid_candidate(self, obj: WorkforceObject) -> None:
        if obj.identity_status == "VERIFIED" or not obj.worker_name:
            return
        for other in self.objects.values():
            if other.object_id == obj.object_id:
                continue
            if other.worker_name == obj.worker_name:
                sim = 0.84
                if sim < REID_STRICT:
                    ids = {m.candidate_object_id for m in obj.possible_matches}
                    if other.object_id not in ids:
                        obj.possible_matches.append(
                            PossibleMatch(other.object_id, sim, 0.5)
                        )

    def merge_objects_to_worker(self, object_ids: list[str], worker_id: str, worker_name: str | None = None) -> None:
        for oid in object_ids:
            obj = self.objects.get(oid)
            if not obj:
                continue
            obj.worker_id = worker_id
            obj.worker_name = worker_name or obj.worker_name
            if obj.identity_status != "VERIFIED":
                obj.identity_status = "DEDUPLICATED"
        self._emit(
            "OBJECT_MERGED", DEFAULT_ZONE, "INFO", "Gộp Object hồi tố",
            f"{', '.join(object_ids)} → {worker_id}",
            {"object_ids": object_ids, "worker_id": worker_id}, show_in_ui=False,
        )

    def _heat_time_decay(self, age_s: float) -> float:
        """W_heat *= TimeDecay; ~e^(-age/15) so stale points fade (spec §7.3)."""
        if age_s <= 0:
            return 1.0
        return math.exp(-age_s / HEAT_DECAY_S)

    def _sample_heat(self, obj: WorkforceObject, s_obs: float, now: float) -> None:
        if obj.lat is None or obj.lon is None:
            return
        if now - obj.last_heat_at < HEAT_INTERVAL_S:
            return
        # Fresh sample: age≈0 → TimeDecay=1; snapshot reapplies decay for older points.
        w = obj.position_confidence * s_obs * self._heat_time_decay(0.0)
        if w <= 0:
            return
        obj.last_heat_at = now
        self.heat_points.append(HeatPoint(obj.lat, obj.lon, w, now, obj.zone_id, obj.object_id))
        if len(self.heat_points) > 5000:
            self.heat_points = self.heat_points[-3000:]

    def _update_population(
        self, zone_id: str, *, observed: int, observability: float, band: ObservabilityBand,
        full_body_count: int, upper_body_count: int, verified_identities: int, unknown_objects: int,
        helmet_id: str, zone_area_sqm: float,
    ) -> None:
        prev = self.latest_population.get(zone_id)
        obs = PopulationObservation(
            zone_id=zone_id, timestamp=_now(), observed_count=int(observed),
            observability=observability, band=band, full_body_count=full_body_count,
            upper_body_count=upper_body_count, verified_identities=verified_identities,
            unknown_objects=unknown_objects, helmet_references=[helmet_id],
        )
        if prev and prev.observed_count == obs.observed_count and (_now() - prev.timestamp) < 30:
            return
        timeline = self.population_timeline.setdefault(zone_id, [])
        timeline.append(obs)
        if len(timeline) > 500:
            self.population_timeline[zone_id] = timeline[-300:]
        self.latest_population[zone_id] = obs
        if band == "HIGH" and (not prev or prev.observed_count != obs.observed_count):
            delta = obs.observed_count - (prev.observed_count if prev else obs.observed_count)
            self._emit_pop_observed(zone_id, obs, delta)
        if prev:
            self._maybe_pop_change(zone_id, prev, obs)
        density = obs.observed_count / max(1.0, zone_area_sqm)
        if density > HIGH_DENSITY:
            self._emit_high_density(zone_id, obs, density)

    def _cd_ok(self, key: str, cd: float) -> bool:
        if _now() - self._cooldown.get(key, 0.0) < cd:
            return False
        self._cooldown[key] = _now()
        return True

    def _emit(
        self, event_type: EventType, zone_id: str, severity: str, title: str, description: str,
        payload: dict[str, Any], *, helmet_id: str | None = None, show_in_ui: bool = True,
    ) -> WorkforceEvent:
        ev = WorkforceEvent(
            event_id=f"EVT-{time.strftime('%Y%m%d')}-{uuid.uuid4().hex[:6].upper()}",
            event_type=event_type, zone_id=zone_id, timestamp=_now(), severity=severity,
            title=title, description=description, payload=payload, helmet_id=helmet_id, show_in_ui=show_in_ui,
        )
        self.events.insert(0, ev)
        self.events = self.events[:300]
        if not show_in_ui:
            self._audit.append({"event_id": ev.event_id, "event_type": event_type, "payload": payload, "ts": ev.timestamp})
        return ev

    def _emit_pop_observed(self, zone_id: str, obs: PopulationObservation, delta: int) -> None:
        if not self._cd_ok(f"POP_OBS:{zone_id}", CD_POP_OBS):
            return
        sign = f"+{delta}" if delta > 0 else str(delta)
        self._emit(
            "POPULATION_OBSERVED", zone_id, "INFO",
            f"{zone_id}: {obs.observed_count} người quan sát",
            f"{obs.observed_count} người ({sign} so với lần trước)",
            {"observed_count": obs.observed_count, "delta": delta, "observability": obs.observability},
        )

    def _maybe_pop_change(self, zone_id: str, prev: PopulationObservation, cur: PopulationObservation) -> None:
        timeline = self.population_timeline.get(zone_id) or []
        cutoff = _now() - 15 * 60
        older = next((o for o in reversed(timeline) if o.timestamp <= cutoff), prev)
        delta = cur.observed_count - older.observed_count
        pct = abs(delta) / max(1, older.observed_count)
        if abs(delta) < 5 and pct < 0.20:
            return
        if not self._cd_ok(f"POP_CHG:{zone_id}", CD_POP_CHG):
            return
        direction = "tăng" if delta > 0 else "giảm"
        self._emit(
            "POPULATION_CHANGE", zone_id, "WARNING",
            f"Nhân lực {direction} tại {zone_id}",
            f"{older.observed_count} → {cur.observed_count} trong 15 phút",
            {"previous_count": older.observed_count, "current_count": cur.observed_count, "time_window_minutes": 15},
        )

    def _emit_high_density(self, zone_id: str, obs: PopulationObservation, density: float) -> None:
        if not self._cd_ok(f"HIGH_D:{zone_id}", CD_HIGH_D):
            return
        self._emit(
            "HIGH_DENSITY", zone_id, "CRITICAL",
            f"Mật độ cao — {zone_id}",
            f"~{obs.observed_count} người ({density:.2f}/m²)",
            {"observed_count": obs.observed_count, "density_per_sqm": density},
        )

    def _emit_identity_verified(self, obj: WorkforceObject, zone_id: str) -> None:
        self._emit(
            "IDENTITY_VERIFIED", zone_id, "INFO",
            f"Đã xác minh — {obj.worker_name or obj.worker_id}",
            f"{obj.object_id} → {obj.worker_id} @ {zone_id}",
            {
                "object_id": obj.object_id, "worker_id": obj.worker_id,
                "worker_name": obj.worker_name, "face_confidence": obj.face_confidence,
            },
            helmet_id=obj.helmet_id,
        )

    def _gc(self, now: float) -> None:
        cutoff = now - 24 * 3600
        for oid in [oid for oid, o in self.objects.items() if o.identity_status == "UNKNOWN" and o.last_seen < cutoff]:
            del self.objects[oid]

    def _population_payload(self, zone_id: str) -> dict[str, Any] | None:
        obs = self.latest_population.get(zone_id)
        if not obs:
            return None
        timeline = self.population_timeline.get(zone_id) or []
        counts = [o.observed_count for o in timeline]
        return {
            "zone_id": zone_id,
            "timestamp": _iso(obs.timestamp),
            "observed_count": obs.observed_count,
            "observability": obs.observability,
            "observability_band": obs.band,
            "breakdown": {
                "full_body_count": obs.full_body_count,
                "upper_body_count": obs.upper_body_count,
                "verified_identities": obs.verified_identities,
                "unknown_objects": obs.unknown_objects,
            },
            "helmet_references": obs.helmet_references,
            "kpi": {
                "current": obs.observed_count,
                "average": round(sum(counts) / len(counts), 1) if counts else 0,
                "peak": max(counts) if counts else 0,
            },
        }

    def snapshot(self, helmet_id: str | None = None, *, now: float | None = None) -> dict[str, Any]:
        t = now or _now()
        helmets_out: dict[str, Any] = {}
        for hid, pose in self.helmets.items():
            if helmet_id and hid != helmet_id:
                continue
            helmets_out[hid] = {
                "type": "HELMET_STATE", "helmet_id": hid, "timestamp": _iso(pose.updated_at),
                "lat": pose.lat, "lon": pose.lon, "heading": pose.heading,
                "pitch": pose.pitch, "roll": pose.roll, "zone_id": pose.zone_id,
                "online": pose.online and (t - pose.updated_at) < 45.0,
                "position_method": pose.position_method,
            }
        objects_out: dict[str, Any] = {}
        for oid, obj in self.objects.items():
            if helmet_id and obj.helmet_id != helmet_id:
                continue
            status = obj.live_status(t)
            if status == "EXPIRED":
                continue
            objects_out[oid] = {
                "type": "OBJECT_STATE", "object_id": oid, "status": status,
                "identity_status": obj.identity_status, "worker_id": obj.worker_id,
                "worker_name": obj.worker_name, "lat": obj.lat, "lon": obj.lon,
                "position_confidence": obj.position_confidence,
                "observation_mode": obj.observation_mode,
                "last_seen": _iso(obj.last_seen), "first_seen": _iso(obj.first_seen),
                "helmet_id": obj.helmet_id, "zone_id": obj.zone_id,
                "possible_matches": [
                    {
                        "candidate_object_id": m.candidate_object_id,
                        "reid_similarity": m.reid_similarity,
                        "spatial_temporal_overlap": m.spatial_temporal_overlap,
                    }
                    for m in obj.possible_matches
                ],
            }
        zones = set(self.latest_population.keys()) | {DEFAULT_ZONE}
        if helmet_id and helmet_id in self.helmets:
            zones.add(self.helmets[helmet_id].zone_id)
        population_out = {z: self._population_payload(z) for z in zones if self._population_payload(z)}
        heat_cutoff = t - 8 * 3600
        heats = []
        for h in self.heat_points:
            if h.timestamp < heat_cutoff:
                continue
            decayed = h.weight * self._heat_time_decay(t - h.timestamp)
            if decayed < 0.02:
                continue
            heats.append({
                "lat": h.lat, "lon": h.lon, "weight": round(decayed, 4),
                "timestamp": _iso(h.timestamp), "zone_id": h.zone_id, "object_id": h.object_id,
            })
        events_out = [
            {
                "type": "EVENT", "event_id": e.event_id, "event_type": e.event_type,
                "zone_id": e.zone_id, "severity": e.severity, "timestamp": _iso(e.timestamp),
                "title": e.title, "description": e.description, "payload": e.payload,
                "helmet_id": e.helmet_id,
            }
            for e in self.events if e.show_in_ui
        ][:80]
        return {
            "helmets": helmets_out, "objects": objects_out, "zonePopulation": population_out,
            "heatPoints": heats[-800:], "events": events_out, "server_time": _iso(t),
        }


workforce_engine = WorkforceEngine()


def ingest_patrol_analyze_result(
    camera_id: str,
    result: dict[str, Any],
    *,
    gps_lat: float | None = None,
    gps_lng: float | None = None,
    heading: float | None = None,
) -> dict[str, Any] | None:
    if not camera_id.startswith("HC-"):
        return None
    if gps_lat is not None and gps_lng is not None:
        workforce_engine.update_helmet(camera_id, lat=gps_lat, lon=gps_lng, heading=heading, online=True)
    elif heading is not None:
        workforce_engine.update_helmet(camera_id, heading=heading, online=True)
    else:
        workforce_engine.update_helmet(camera_id, online=True)
    detections = result.get("detections") or []
    metrics = result.get("metrics") or {}
    fw = float(metrics.get("frame_width") or result.get("frame_width") or 1280)
    fh = float(metrics.get("frame_height") or result.get("frame_height") or 720)
    return workforce_engine.ingest_frame(camera_id, detections, frame_w=fw, frame_h=fh)
