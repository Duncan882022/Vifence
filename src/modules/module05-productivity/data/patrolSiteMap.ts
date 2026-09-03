/** Module 05 — Site Map: GPS zones, helmet pins, patrol trail.
 *  Coordinate system: [lat, lng] throughout (Leaflet convention).
 *
 *  Hành lang CT06 Quảng Yên — 6 khu dọc tuyến CT06
 *  Center: 20.931225°N, 106.893700°E (Bùi Xá)
 *  ROI: PATROL_SITE_BOUNDARY_RING in patrolSiteGeometry.ts
 */

import {
  clipPolygonToSiteBoundary,
  PATROL_SITE_BOUNDARY_RING,
  PATROL_SITE_CORNERS,
} from './patrolSiteGeometry'
import type { PatrolZone } from './patrolTypes'

export const PATROL_SITE_NAME = 'Hành lang CT06 Quảng Yên'
/** Khu trung tâm (Bùi Xá) — fallback zone id. */
export const PATROL_SITE_ZONE_ID = 'ZONE_3'

const SITE_TOP = PATROL_SITE_CORNERS[0]
const SITE_RIGHT = PATROL_SITE_CORNERS[1]
const SITE_BOTTOM = PATROL_SITE_CORNERS[2]
const SITE_LEFT = PATROL_SITE_CORNERS[3]

/** Bilinear point inside site quad — u: west→east, v: north→south. */
function sitePoint(u: number, v: number): [number, number] {
  const lat =
    (1 - u) * (1 - v) * SITE_TOP[0] +
    u * (1 - v) * SITE_RIGHT[0] +
    u * v * SITE_BOTTOM[0] +
    (1 - u) * v * SITE_LEFT[0]
  const lng =
    (1 - u) * (1 - v) * SITE_TOP[1] +
    u * (1 - v) * SITE_RIGHT[1] +
    u * v * SITE_BOTTOM[1] +
    (1 - u) * v * SITE_LEFT[1]
  return [parseFloat(lat.toFixed(6)), parseFloat(lng.toFixed(6))]
}

/** Sub-quad cell — TL→TR→BR→BL, clipped to capsule boundary. */
function siteCell(u0: number, u1: number, v0: number, v1: number): [number, number][] {
  return [
    sitePoint(u0, v0),
    sitePoint(u1, v0),
    sitePoint(u1, v1),
    sitePoint(u0, v1),
  ]
}

function cellCenter(u0: number, u1: number, v0: number, v1: number): [number, number] {
  return sitePoint((u0 + u1) / 2, (v0 + v1) / 2)
}

/** Map centre — tham chiếu khảo sát Bùi Xá (20°55'42.4"N 106°52'25.0"E). */
export const PATROL_SITE_CENTER: [number, number] = [20.928444, 106.873611]

function polygonCenter(polygon: [number, number][]): [number, number] {
  if (polygon.length === 0) return PATROL_SITE_CENTER
  const lat = polygon.reduce((s, p) => s + p[0], 0) / polygon.length
  const lng = polygon.reduce((s, p) => s + p[1], 0) / polygon.length
  return [parseFloat(lat.toFixed(6)), parseFloat(lng.toFixed(6))]
}

/** Point inside zone quad — u/v ∈ [0,1], inset from edges. */
export function patrolZoneInteriorPoint(
  polygon: [number, number][],
  u: number,
  v: number,
): [number, number] {
  if (polygon.length < 4) {
    return polygonCenter(polygon)
  }
  const [tl, tr, br, bl] = polygon
  const lat =
    (1 - u) * (1 - v) * tl[0] +
    u * (1 - v) * tr[0] +
    u * v * br[0] +
    (1 - u) * v * bl[0]
  const lng =
    (1 - u) * (1 - v) * tl[1] +
    u * (1 - v) * tr[1] +
    u * v * br[1] +
    (1 - u) * v * bl[1]
  return [parseFloat(lat.toFixed(6)), parseFloat(lng.toFixed(6))]
}

const _SITE_POLY = [...PATROL_SITE_CORNERS] as [number, number][]

/** HC-01 không GPS → neo tây (khu 1–2). */
export const PATROL_HELMET_01_FALLBACK: [number, number] = sitePoint(0.14, 0.42)

/** HC-02 không GPS → neo đông (khu 5–6). */
export const PATROL_HELMET_02_FALLBACK: [number, number] = sitePoint(0.86, 0.58)

/** DR-03 không GPS → neo giữa tuyến CT06. */
export const PATROL_DRONE_03_FALLBACK: [number, number] = sitePoint(0.5, 0.35)

/* ── GPS Zone type ──────────────────────────────────────────── */
export interface PatrolGpsZone {
  zone_id: string
  name: string
  shortName: string
  /** Polygon vertices as [lat, lng] pairs (Leaflet convention). */
  polygon: [number, number][]
  area_m2: number
  tier: 'primary' | 'secondary'
  /** Tailwind / hex colour used for zone border on map. */
  borderColor: string
  /** Approximate zone centre [lat, lng]. */
  center: [number, number]
}

function buildGpsZone(
  zone_id: string,
  name: string,
  shortName: string,
  rawPolygon: readonly [number, number][],
  area_m2: number,
  tier: 'primary' | 'secondary',
  borderColor: string,
): PatrolGpsZone {
  const polygon = clipPolygonToSiteBoundary([...rawPolygon])
  return {
    zone_id,
    name,
    shortName,
    polygon,
    area_m2,
    tier,
    borderColor,
    center: polygonCenter(polygon),
  }
}

/** Chia 6 khu dọc CT06 — ranh u tinh chỉnh để ghim Bùi Xá thuộc ZONE_3. */
const ZONE_U_SPLITS = [0, 0.12, 0.22, 0.38, 0.55, 0.75, 1] as const

export const PATROL_SITE_AREA_M2 = 19_000_000

/**
 * 6 khu dọc CT06 (tây → đông):
 *  [1] Đình Trung Bản | [2] Xóm Thành | [3] Bùi Xá
 *  [4] Đảo Hoàng Tân | [5] Hạ Long Xanh | [6] Bệnh viện Sản Nhi
 */
export const PATROL_GPS_ZONES: PatrolGpsZone[] = [
  buildGpsZone('ZONE_1', 'Khu Đình Trung Bản', 'TĐB', siteCell(ZONE_U_SPLITS[0], ZONE_U_SPLITS[1], 0, 1), 2_900_000, 'primary', '#ef4444'),
  buildGpsZone('ZONE_2', 'Khu Xóm Thành', 'XTh', siteCell(ZONE_U_SPLITS[1], ZONE_U_SPLITS[2], 0, 1), 2_600_000, 'primary', '#eab308'),
  buildGpsZone('ZONE_3', 'Khu Bùi Xá', 'BX', siteCell(ZONE_U_SPLITS[2], ZONE_U_SPLITS[3], 0, 1), 3_400_000, 'primary', '#22c55e'),
  buildGpsZone('ZONE_4', 'Khu Đảo Hoàng Tân', 'ĐHT', siteCell(ZONE_U_SPLITS[3], ZONE_U_SPLITS[4], 0, 1), 3_200_000, 'primary', '#3b82f6'),
  buildGpsZone('ZONE_5', 'Khu Hạ Long Xanh', 'HLX', siteCell(ZONE_U_SPLITS[4], ZONE_U_SPLITS[5], 0, 1), 3_400_000, 'primary', '#a855f7'),
  buildGpsZone('ZONE_6', 'Khu Bệnh viện Sản Nhi', 'BV', siteCell(ZONE_U_SPLITS[5], ZONE_U_SPLITS[6], 0, 1), 3_500_000, 'primary', '#06b6d4'),
]

export const PATROL_SITE_ZONE_SEED: PatrolZone[] = PATROL_GPS_ZONES.map((zone, idx) => ({
  id: zone.zone_id,
  name: zone.name,
  shortName: zone.shortName,
  coverage: idx < 2 ? 'VISITED' : 'NOT_VISITED',
  dwellSeconds: 420 + idx * 45,
  peopleCurrent: idx === 2 ? 42 : 12 + idx * 3,
  vehiclesCurrent: idx === 2 ? 8 : 2 + idx,
  uniquePeople: 28 + idx * 5,
  uniqueVehicles: 4 + idx,
  areaSqm: zone.area_m2,
}))

/* ── Helmet GPS pins ────────────────────────────────────────── */
export interface PatrolHelmetPin {
  id: string
  label: string
  zoneId: string
  color: string
  /** Initial GPS position [lat, lng]. Updated via WS camera_position events. */
  position: [number, number]
}

/** Khu phụ trách — HC-01 tây, HC-02 đông. */
export const PATROL_HELMET_ZONE_ASSIGNMENTS: readonly {
  helmetId: string
  zoneId: string
}[] = [
  { helmetId: 'HC-01', zoneId: 'ZONE_2' },
  { helmetId: 'HC-02', zoneId: 'ZONE_5' },
] as const

function buildHelmetPins(): PatrolHelmetPin[] {
  return (PATROL_HELMET_ZONE_ASSIGNMENTS as readonly { helmetId: string; zoneId: string }[]).map(({ helmetId, zoneId }) => {
    const zone = PATROL_GPS_ZONES.find(z => z.zone_id === zoneId)!
    const num = helmetId.replace('HC-', '')
    return {
      id: helmetId,
      label: `Helmet ${num}`,
      zoneId,
      color: zone.borderColor,
      position: zone.center,
    }
  })
}

export const PATROL_HELMET_GPS_PINS: PatrolHelmetPin[] = buildHelmetPins()

/** Tạm chỉ HC-01 + HC-02 trên heatmap. */
export const PATROL_MAP_ACTIVE_HELMET_IDS = ['HC-01', 'HC-02'] as const

export const PATROL_MAP_ACTIVE_HELMET_PINS: PatrolHelmetPin[] = PATROL_HELMET_GPS_PINS.filter(
  pin => (PATROL_MAP_ACTIVE_HELMET_IDS as readonly string[]).includes(pin.id),
)

/** Pin flycam trên heatmap — cùng contract với mũ, badge số 3. */
export interface PatrolDronePin {
  id: string
  label: string
  zoneId: string
  color: string
  position: [number, number]
}

export const PATROL_MAP_ACTIVE_DRONE_PINS: PatrolDronePin[] = [
  {
    id: 'DR-03',
    label: 'Drone 03',
    zoneId: PATROL_SITE_ZONE_ID,
    color: PATROL_GPS_ZONES.find(z => z.zone_id === PATROL_SITE_ZONE_ID)?.borderColor ?? '#22c55e',
    position: PATROL_SITE_CENTER,
  },
]

export function getPatrolMapDeviceBadgeNum(deviceId: string): string {
  const helmetNum = deviceId.replace(/^HC-0?/, '')
  if (/^\d+$/.test(helmetNum)) return helmetNum
  const droneNum = deviceId.replace(/^DR-0?/, '')
  if (/^\d+$/.test(droneNum)) return droneNum
  return deviceId.slice(-1)
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

export function buildHelmetZoneTrail(
  polygon: [number, number][],
  phaseSeed = 0,
  stepsPerLeg = 10,
): [number, number][] {
  const inset = 0.2
  const uVals = [inset, 0.5, 1 - inset]
  const vVals = [inset, 0.5, 1 - inset]

  const waypoints: [number, number][] = []
  for (let row = 0; row < vVals.length; row += 1) {
    const v = vVals[(row + phaseSeed) % vVals.length]
    const uOrder = row % 2 === 0 ? uVals : [...uVals].reverse()
    for (const u of uOrder) {
      waypoints.push(patrolZoneInteriorPoint(polygon, u, v))
    }
  }
  waypoints.push(waypoints[0])

  const trail: [number, number][] = []
  for (let i = 0; i < waypoints.length - 1; i += 1) {
    const [lat1, lng1] = waypoints[i]
    const [lat2, lng2] = waypoints[i + 1]
    for (let s = 0; s < stepsPerLeg; s += 1) {
      const t = s / stepsPerLeg
      trail.push([
        parseFloat(lerp(lat1, lat2, t).toFixed(6)),
        parseFloat(lerp(lng1, lng2, t).toFixed(6)),
      ])
    }
  }
  return trail
}

export const PATROL_HELMET_ZONE_TRAILS: Record<string, [number, number][]> =
  Object.fromEntries(
    PATROL_HELMET_GPS_PINS.map(pin => {
      const zone = PATROL_GPS_ZONES.find(z => z.zone_id === pin.zoneId)!
      const phase = parseInt(pin.id.replace('HC-', ''), 10) - 1
      return [pin.id, buildHelmetZoneTrail(zone.polygon, phase)]
    }),
  )

export function getPatrolHelmetZoneName(helmetId: string): string {
  const assignment = PATROL_HELMET_ZONE_ASSIGNMENTS.find(row => row.helmetId === helmetId)
  const zone = PATROL_GPS_ZONES.find(z => z.zone_id === assignment?.zoneId)
  return zone?.name ?? PATROL_SITE_NAME
}

export function buildPatrolGpsTrail(stepsPerSegment = 10): [number, number][] {
  const ring = PATROL_SITE_BOUNDARY_RING
  const waypoints = [...ring, ring[0]]
  const trail: [number, number][] = []
  for (let i = 0; i < waypoints.length - 1; i += 1) {
    const [lat1, lng1] = waypoints[i]
    const [lat2, lng2] = waypoints[i + 1]
    for (let s = 0; s < stepsPerSegment; s += 1) {
      const t = s / stepsPerSegment
      trail.push([
        parseFloat(lerp(lat1, lat2, t).toFixed(6)),
        parseFloat(lerp(lng1, lng2, t).toFixed(6)),
      ])
    }
  }
  return trail
}

export const PATROL_GPS_TRAIL = buildPatrolGpsTrail()

export {
  PATROL_SITE_BOUNDARY,
  PATROL_SITE_BOUNDARY_RING,
  PATROL_SITE_CLIP_RING,
  isPointInSiteBoundary,
  clampPointToSiteBoundary,
  clipPolygonToSiteBoundary,
} from './patrolSiteGeometry'

const SITE_PAD = 0.002

/** Giới hạn pan/zoom — trong phạm vi hành lang CT06 [SW, NE]. */
export const PATROL_SITE_FOCUS_BOUNDS: [[number, number], [number, number]] = [
  [
    Math.min(...PATROL_SITE_BOUNDARY_RING.map(p => p[0])) - SITE_PAD,
    Math.min(...PATROL_SITE_BOUNDARY_RING.map(p => p[1])) - SITE_PAD,
  ],
  [
    Math.max(...PATROL_SITE_BOUNDARY_RING.map(p => p[0])) + SITE_PAD,
    Math.max(...PATROL_SITE_BOUNDARY_RING.map(p => p[1])) + SITE_PAD,
  ],
]

export const PATROL_SITE_MIN_ZOOM = 13
export const PATROL_SITE_MAX_ZOOM = 19
