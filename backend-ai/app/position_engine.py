"""
Position estimation — EKF GPS+IMU + map matching (spec §6).
GPS ~1 Hz + IMU predict ~50 Hz → helmet pose mượt; snap vào site polygon.
"""
from __future__ import annotations

import math
import time
from dataclasses import dataclass, field

import numpy as np

from .patrol_site_geometry import PATROL_SITE_CENTER, snap_point_to_site

M_PER_DEG_LAT = 111_320.0
GPS_DEFAULT_ACCURACY_M = 8.0
MAX_PREDICT_DT_S = 0.5


def latlon_to_enu(lat: float, lon: float, ref_lat: float, ref_lon: float) -> tuple[float, float]:
    cos_lat = math.cos(math.radians(ref_lat))
    east = (lon - ref_lon) * M_PER_DEG_LAT * cos_lat
    north = (lat - ref_lat) * M_PER_DEG_LAT
    return east, north


def enu_to_latlon(east: float, north: float, ref_lat: float, ref_lon: float) -> tuple[float, float]:
    cos_lat = math.cos(math.radians(ref_lat))
    lat = ref_lat + north / M_PER_DEG_LAT
    lon = ref_lon + east / (M_PER_DEG_LAT * max(cos_lat, 1e-6))
    return lat, lon


@dataclass
class HelmetEkf:
    """4-state ENU Kalman: east, north, v_east, v_north (m, m/s)."""

    ref_lat: float
    ref_lon: float
    x: np.ndarray = field(default_factory=lambda: np.zeros(4))
    P: np.ndarray = field(default_factory=lambda: np.eye(4) * 25.0)
    heading_deg: float = 0.0
    last_ts: float = 0.0
    initialized: bool = False

    def predict(self, dt: float, heading_deg: float | None = None) -> None:
        if dt <= 0:
            return
        dt = min(dt, MAX_PREDICT_DT_S)
        F = np.eye(4)
        F[0, 2] = dt
        F[1, 3] = dt
        q_pos = 0.08 * dt
        q_vel = 0.35 * dt
        Q = np.diag([q_pos, q_pos, q_vel, q_vel])
        self.x = F @ self.x
        self.P = F @ self.P @ F.T + Q
        if heading_deg is not None:
            self.heading_deg = float(heading_deg) % 360.0
            speed = float(math.hypot(self.x[2], self.x[3]))
            if speed < 0.45:
                br = math.radians(self.heading_deg)
                self.x[2] = 0.25 * math.sin(br)
                self.x[3] = 0.25 * math.cos(br)

    def update_gps(self, lat: float, lon: float, accuracy_m: float = GPS_DEFAULT_ACCURACY_M) -> None:
        east, north = latlon_to_enu(lat, lon, self.ref_lat, self.ref_lon)
        if not self.initialized:
            self.x[0], self.x[1] = east, north
            self.x[2] = self.x[3] = 0.0
            self.initialized = True
            var = max(4.0, float(accuracy_m) ** 2)
            self.P = np.eye(4) * var
            return
        z = np.array([east, north])
        H = np.array([[1.0, 0.0, 0.0, 0.0], [0.0, 1.0, 0.0, 0.0]])
        r_var = max(4.0, float(accuracy_m) ** 2)
        R = np.eye(2) * r_var
        y = z - H @ self.x
        S = H @ self.P @ H.T + R
        K = self.P @ H.T @ np.linalg.inv(S)
        self.x = self.x + K @ y
        self.P = (np.eye(4) - K @ H) @ self.P

    def lat_lon(self) -> tuple[float, float] | None:
        if not self.initialized:
            return None
        return enu_to_latlon(float(self.x[0]), float(self.x[1]), self.ref_lat, self.ref_lon)


class HelmetPositionTracker:
    """Per-helmet EKF + map matching."""

    def __init__(self) -> None:
        self._ekf: dict[str, HelmetEkf] = {}

    def _get(self, helmet_id: str) -> HelmetEkf:
        if helmet_id not in self._ekf:
            ref_lat, ref_lon = PATROL_SITE_CENTER
            self._ekf[helmet_id] = HelmetEkf(ref_lat=ref_lat, ref_lon=ref_lon)
        return self._ekf[helmet_id]

    def fuse_helmet_pose(
        self,
        helmet_id: str,
        *,
        lat: float | None = None,
        lon: float | None = None,
        heading: float | None = None,
        pitch: float | None = None,
        roll: float | None = None,
        accuracy_m: float | None = None,
        ts: float | None = None,
    ) -> tuple[float | None, float | None, float | None, str]:
        """
        Returns (lat, lon, heading, method) after EKF + map match.
        method: raw | ekf | ekf_map | imu_only
        """
        del pitch, roll  # reserved for future 6-DOF; heading drives predict
        now = ts if ts is not None else time.time()
        ekf = self._get(helmet_id)
        if ekf.last_ts > 0:
            ekf.predict(now - ekf.last_ts, heading_deg=heading)
        ekf.last_ts = now

        method = "imu_only"
        out_lat: float | None = None
        out_lon: float | None = None
        out_heading = (float(heading) % 360.0) if heading is not None else ekf.heading_deg

        has_gps = (
            lat is not None
            and lon is not None
            and math.isfinite(lat)
            and math.isfinite(lon)
            and not (lat == 0.0 and lon == 0.0)
        )
        if has_gps:
            ekf.update_gps(float(lat), float(lon), accuracy_m or GPS_DEFAULT_ACCURACY_M)
            method = "ekf"
            pair = ekf.lat_lon()
            if pair:
                out_lat, out_lon = pair

        if out_lat is None and ekf.initialized:
            pair = ekf.lat_lon()
            if pair:
                out_lat, out_lon = pair

        if out_lat is not None and out_lon is not None:
            matched_lat, matched_lon, _inside = snap_point_to_site(out_lat, out_lon)
            out_lat, out_lon = matched_lat, matched_lon
            if method == "ekf":
                method = "ekf_map"

        if heading is not None:
            ekf.heading_deg = float(heading) % 360.0
            out_heading = ekf.heading_deg

        return out_lat, out_lon, out_heading, method

    def map_match_object(self, lat: float, lon: float) -> tuple[float, float]:
        matched_lat, matched_lon, _ = snap_point_to_site(lat, lon)
        return matched_lat, matched_lon

    def reset(self, helmet_id: str | None = None) -> None:
        if helmet_id is None:
            self._ekf.clear()
        else:
            self._ekf.pop(helmet_id, None)


helmet_position_tracker = HelmetPositionTracker()


def fuse_helmet_pose(
    helmet_id: str,
    *,
    lat: float | None = None,
    lon: float | None = None,
    heading: float | None = None,
    pitch: float | None = None,
    roll: float | None = None,
    accuracy_m: float | None = None,
    ts: float | None = None,
) -> tuple[float | None, float | None, float | None, str]:
    return helmet_position_tracker.fuse_helmet_pose(
        helmet_id,
        lat=lat,
        lon=lon,
        heading=heading,
        pitch=pitch,
        roll=roll,
        accuracy_m=accuracy_m,
        ts=ts,
    )


def map_match_position(lat: float, lon: float) -> tuple[float, float]:
    return helmet_position_tracker.map_match_object(lat, lon)
