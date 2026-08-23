/**
 * Position engine — EKF GPS+IMU + map matching (spec §6).
 * FE mirror of backend-ai/app/position_engine.py
 */
import {
  clampPointToSiteBoundary,
  isPointInSiteBoundary,
  PATROL_SITE_CORNERS,
} from '../data/patrolSiteGeometry'
import { PATROL_SITE_CENTER } from '../data/patrolSiteMap'
import { isPatrolRelativeGpsCamera } from './patrolGpsConfig'

const M_PER_DEG_LAT = 111_320
const GPS_DEFAULT_ACCURACY_M = 8
const MAX_PREDICT_DT_S = 0.5
/** Giới hạn drift tương đối (~120m) — tránh GPS nhảy xa khỏi công trường. */
const MAX_RELATIVE_OFFSET_M = 120

export type HelmetPositionMethod =
  | 'raw'
  | 'ekf'
  | 'ekf_map'
  | 'map'
  | 'imu_only'
  | 'relative'
  | 'relative_ekf'

function latLonToEnu(
  lat: number,
  lng: number,
  refLat: number,
  refLng: number,
): [number, number] {
  const cosLat = Math.cos((refLat * Math.PI) / 180)
  const east = (lng - refLng) * M_PER_DEG_LAT * cosLat
  const north = (lat - refLat) * M_PER_DEG_LAT
  return [east, north]
}

function enuToLatLon(
  east: number,
  north: number,
  refLat: number,
  refLng: number,
): [number, number] {
  const cosLat = Math.cos((refLat * Math.PI) / 180)
  const lat = refLat + north / M_PER_DEG_LAT
  const lng = refLng + east / (M_PER_DEG_LAT * Math.max(cosLat, 1e-6))
  return [lat, lng]
}

function isValidGps(lat: number, lng: number): boolean {
  return Number.isFinite(lat)
    && Number.isFinite(lng)
    && !(lat === 0 && lng === 0)
}

function nearestOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): [number, number, number] {
  const abx = bx - ax
  const aby = by - ay
  const apx = px - ax
  const apy = py - ay
  const denom = abx * abx + aby * aby
  if (denom <= 1e-18) {
    return [ax, ay, Math.hypot(px - ax, py - ay)]
  }
  const t = Math.max(0, Math.min(1, (apx * abx + apy * aby) / denom))
  const qx = ax + t * abx
  const qy = ay + t * aby
  return [qx, qy, Math.hypot(px - qx, py - qy)]
}

/** Map matching — snap ngoài ranh lên cạnh polygon site. */
export function snapPointToSite(lat: number, lng: number): [number, number, boolean] {
  if (isPointInSiteBoundary(lat, lng)) {
    return [lat, lng, true]
  }
  let bestLat = lat
  let bestLng = lng
  let bestD = Infinity
  const px = lng
  const py = lat
  const ring = PATROL_SITE_CORNERS
  for (let i = 0; i < ring.length; i += 1) {
    const [aLat, aLng] = ring[i]
    const [bLat, bLng] = ring[(i + 1) % ring.length]
    const [qx, qy, d] = nearestOnSegment(px, py, aLng, aLat, bLng, bLat)
    if (d < bestD) {
      bestD = d
      bestLat = qy
      bestLng = qx
    }
  }
  if (!isPointInSiteBoundary(bestLat, bestLng)) {
    return [...clampPointToSiteBoundary(lat, lng), false] as [number, number, boolean]
  }
  return [
    parseFloat(bestLat.toFixed(6)),
    parseFloat(bestLng.toFixed(6)),
    false,
  ]
}

class HelmetEkf {
  private refLat: number
  private refLng: number
  private x = [0, 0, 0, 0]
  private p = [25, 0, 0, 0, 0, 25, 0, 0, 0, 0, 25, 0, 0, 0, 0, 25]
  headingDeg = 0
  lastTs = 0
  initialized = false

  constructor(refLat: number, refLng: number) {
    this.refLat = refLat
    this.refLng = refLng
  }

  predict(dt: number, headingDeg?: number | null): void {
    if (dt <= 0) return
    const step = Math.min(dt, MAX_PREDICT_DT_S)
    this.x[0] += this.x[2] * step
    this.x[1] += this.x[3] * step
    const q = 0.15 * step
    this.p[0] += q
    this.p[5] += q
    this.p[10] += q * 2
    this.p[15] += q * 2
    if (headingDeg != null && Number.isFinite(headingDeg)) {
      this.headingDeg = ((headingDeg % 360) + 360) % 360
      const speed = Math.hypot(this.x[2], this.x[3])
      if (speed < 0.45) {
        const br = (this.headingDeg * Math.PI) / 180
        this.x[2] = 0.25 * Math.sin(br)
        this.x[3] = 0.25 * Math.cos(br)
      }
    }
  }

  updateGps(lat: number, lng: number, accuracyM = GPS_DEFAULT_ACCURACY_M): void {
    const [east, north] = latLonToEnu(lat, lng, this.refLat, this.refLng)
    if (!this.initialized) {
      this.x[0] = east
      this.x[1] = north
      this.x[2] = 0
      this.x[3] = 0
      this.initialized = true
      const v = Math.max(4, accuracyM ** 2)
      this.p = [v, 0, 0, 0, 0, v, 0, 0, 0, 0, v, 0, 0, 0, 0, v]
      return
    }
    const r = Math.max(4, accuracyM ** 2)
    const k0 = this.p[0] / (this.p[0] + r)
    const k1 = this.p[5] / (this.p[5] + r)
    this.x[0] += k0 * (east - this.x[0])
    this.x[1] += k1 * (north - this.x[1])
    this.p[0] *= (1 - k0)
    this.p[5] *= (1 - k1)
  }

  latLng(): [number, number] | null {
    if (!this.initialized) return null
    return enuToLatLon(this.x[0], this.x[1], this.refLat, this.refLng)
  }
}

const ekfByHelmet = new Map<string, HelmetEkf>()
/** Mốc GPS thật lần đầu — delta cộng vào PATROL_SITE_CENTER. */
const gpsAnchorByHelmet = new Map<string, { lat: number; lng: number }>()

function clampRelativeOffsetMeters(eastM: number, northM: number): [number, number] {
  const dist = Math.hypot(eastM, northM)
  if (dist <= MAX_RELATIVE_OFFSET_M || dist <= 1e-6) return [eastM, northM]
  const scale = MAX_RELATIVE_OFFSET_M / dist
  return [eastM * scale, northM * scale]
}

/**
 * Demo GPS: vị trí hiển thị = site center + (GPS hiện tại − GPS mốc ban đầu).
 * Lần fix đầu → neo tại center; đi bộ ở Hà Nội vẫn thấy di chuyển trong Cầu Sông Hốt.
 */
export function mapRelativeGpsToSite(
  cameraId: string,
  lat: number,
  lng: number,
): [number, number] {
  const anchor = gpsAnchorByHelmet.get(cameraId)
  if (!anchor) {
    gpsAnchorByHelmet.set(cameraId, { lat, lng })
    return [PATROL_SITE_CENTER[0], PATROL_SITE_CENTER[1]]
  }

  const [dEast, dNorth] = latLonToEnu(lat, lng, anchor.lat, anchor.lng)
  const [cEast, cNorth] = clampRelativeOffsetMeters(dEast, dNorth)
  return enuToLatLon(
    cEast,
    cNorth,
    PATROL_SITE_CENTER[0],
    PATROL_SITE_CENTER[1],
  )
}

function getEkf(helmetId: string): HelmetEkf {
  let ekf = ekfByHelmet.get(helmetId)
  if (!ekf) {
    ekf = new HelmetEkf(PATROL_SITE_CENTER[0], PATROL_SITE_CENTER[1])
    ekfByHelmet.set(helmetId, ekf)
  }
  return ekf
}

export interface FuseHelmetPoseInput {
  cameraId: string
  lat?: number | null
  lng?: number | null
  heading?: number | null
  accuracyM?: number
  ts?: number
}

export interface FusedHelmetPose {
  lat: number | null
  lng: number | null
  heading: number | null
  method: HelmetPositionMethod
}

export function fuseHelmetPose(input: FuseHelmetPoseInput): FusedHelmetPose {
  const now = input.ts ?? Date.now()
  const ekf = getEkf(input.cameraId)
  if (ekf.lastTs > 0) {
    ekf.predict((now - ekf.lastTs) / 1000, input.heading)
  }
  ekf.lastTs = now

  let method: HelmetPositionMethod = 'imu_only'
  let outLat: number | null = null
  let outLng: number | null = null
  let outHeading = input.heading != null && Number.isFinite(input.heading)
    ? ((input.heading! % 360) + 360) % 360
    : ekf.headingDeg

  let gpsLat = input.lat
  let gpsLng = input.lng
  const useRelative = isPatrolRelativeGpsCamera(input.cameraId)

  if (
    useRelative
    && gpsLat != null
    && gpsLng != null
    && isValidGps(gpsLat, gpsLng)
  ) {
    ;[gpsLat, gpsLng] = mapRelativeGpsToSite(input.cameraId, gpsLat, gpsLng)
    method = 'relative'
  }

  if (gpsLat != null && gpsLng != null && isValidGps(gpsLat, gpsLng)) {
    ekf.updateGps(gpsLat, gpsLng, input.accuracyM ?? GPS_DEFAULT_ACCURACY_M)
    if (method === 'relative') method = 'relative_ekf'
    else method = 'ekf'
    const pair = ekf.latLng()
    if (pair) {
      outLat = pair[0]
      outLng = pair[1]
    }
  } else {
    const pair = ekf.latLng()
    if (pair) {
      outLat = pair[0]
      outLng = pair[1]
    }
  }

  if (outLat != null && outLng != null) {
    const [mLat, mLng] = snapPointToSite(outLat, outLng)
    outLat = mLat
    outLng = mLng
    if (method === 'relative_ekf') method = 'relative_ekf'
    else if (method === 'ekf') method = 'ekf_map'
  } else if (gpsLat != null && gpsLng != null && isValidGps(gpsLat, gpsLng)) {
    const [mLat, mLng] = snapPointToSite(gpsLat, gpsLng)
    outLat = mLat
    outLng = mLng
    method = useRelative ? 'relative' : 'map'
  }

  if (input.heading != null && Number.isFinite(input.heading)) {
    ekf.headingDeg = ((input.heading % 360) + 360) % 360
    outHeading = ekf.headingDeg
  }

  return { lat: outLat, lng: outLng, heading: outHeading, method }
}

export function mapMatchPosition(lat: number, lng: number): [number, number] {
  const [mLat, mLng] = snapPointToSite(lat, lng)
  return [mLat, mLng]
}

export function ingestHelmetImu(cameraId: string, heading: number, ts = Date.now()): void {
  const ekf = getEkf(cameraId)
  if (ekf.lastTs > 0) {
    ekf.predict((ts - ekf.lastTs) / 1000, heading)
  }
  ekf.lastTs = ts
  ekf.headingDeg = ((heading % 360) + 360) % 360
}

export function resetHelmetPositionEngine(cameraId?: string): void {
  if (!cameraId) {
    ekfByHelmet.clear()
    gpsAnchorByHelmet.clear()
    return
  }
  ekfByHelmet.delete(cameraId)
  gpsAnchorByHelmet.delete(cameraId)
}
