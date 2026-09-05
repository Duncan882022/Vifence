/** Module 05 — Site Map: GPS zone, helmet pins, patrol trail.
 *  Coordinate system: [lat, lng] throughout (Leaflet convention).
 *
 *  Dự án Cầu Sông Hốt — hai khu vực khảo sát (đỏ + xanh).
 */

import {
  isPointInSiteBoundary,
  PATROL_SITE_BOUNDARY_RING,
  PATROL_SURVEY_PIN,
  PATROL_ZONE_1_QUAD,
  PATROL_ZONE_2_QUAD,
} from './patrolSiteGeometry'
import type { PatrolZone } from './patrolTypes'

export const PATROL_SITE_NAME = 'Cầu Sông Hốt'
export const PATROL_SITE_ZONE_ID = 'ZONE_1'
export const PATROL_SITE_ZONE_2_ID = 'ZONE_2'

/** Map centre — centroid toàn công trường. */
export const PATROL_SITE_CENTER: [number, number] = [...PATROL_SURVEY_PIN]

function polygonCenter(polygon: [number, number][]): [number, number] {
  if (polygon.length === 0) return PATROL_SITE_CENTER
  const lat = polygon.reduce((s, p) => s + p[0], 0) / polygon.length
  const lng = polygon.reduce((s, p) => s + p[1], 0) / polygon.length
  return [parseFloat(lat.toFixed(6)), parseFloat(lng.toFixed(6))]
}

export const PATROL_ZONE_1_CENTER = polygonCenter(PATROL_ZONE_1_QUAD)
export const PATROL_ZONE_2_CENTER = polygonCenter(PATROL_ZONE_2_QUAD)

export function patrolZoneCenter(zoneIndex = 1, _v = 0.5): [number, number] {
  if (zoneIndex === 2) return PATROL_ZONE_2_CENTER
  return PATROL_ZONE_1_CENTER
}

/** Không còn chia khu — không vẽ nét đứt. */
export function buildPatrolZoneDividerLines(_samples = 24): [number, number][][] {
  return []
}

export const PATROL_ZONE_DIVIDER_LINES: [number, number][][] = []

/** Nội suy điểm trong quad zone (u/v ∈ [0,1]). */
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
    (1 - u) * (1 - v) * tl[0]
    + u * (1 - v) * tr[0]
    + u * v * br[0]
    + (1 - u) * v * bl[0]
  const lng =
    (1 - u) * (1 - v) * tl[1]
    + u * (1 - v) * tr[1]
    + u * v * br[1]
    + (1 - u) * v * bl[1]
  return [parseFloat(lat.toFixed(6)), parseFloat(lng.toFixed(6))]
}

function offsetSitePoint(lat: number, lng: number, dLat: number, dLng: number): [number, number] {
  return [
    parseFloat((lat + dLat).toFixed(6)),
    parseFloat((lng + dLng).toFixed(6)),
  ]
}

export const PATROL_HELMET_01_FALLBACK: [number, number] = offsetSitePoint(
  PATROL_ZONE_1_CENTER[0],
  PATROL_ZONE_1_CENTER[1],
  0.00015,
  -0.0012,
)
export const PATROL_HELMET_02_FALLBACK: [number, number] = offsetSitePoint(
  PATROL_ZONE_2_CENTER[0],
  PATROL_ZONE_2_CENTER[1],
  -0.00012,
  0.0015,
)
export const PATROL_DRONE_03_FALLBACK: [number, number] = [...PATROL_SITE_CENTER]

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

/** Diện tích gần đúng (m²) — shoelace trên ENU quanh centroid. */
function estimateQuadAreaM2(polygon: readonly [number, number][]): number {
  if (polygon.length < 3) return 0
  const refLat = polygon.reduce((s, p) => s + p[0], 0) / polygon.length
  const cosLat = Math.cos((refLat * Math.PI) / 180)
  const pts = polygon.map(([lat, lng]) => [
    lng * 111_320 * cosLat,
    lat * 111_320,
  ] as [number, number])
  let sum = 0
  for (let i = 0; i < pts.length; i += 1) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[(i + 1) % pts.length]
    sum += x1 * y2 - x2 * y1
  }
  return Math.round(Math.abs(sum) / 2)
}

const ZONE_1_POLYGON: [number, number][] = [...PATROL_ZONE_1_QUAD]
const ZONE_2_POLYGON: [number, number][] = [...PATROL_ZONE_2_QUAD]
const ZONE_1_AREA_M2 = estimateQuadAreaM2(ZONE_1_POLYGON)
const ZONE_2_AREA_M2 = estimateQuadAreaM2(ZONE_2_POLYGON)

export const PATROL_SITE_AREA_M2 = ZONE_1_AREA_M2 + ZONE_2_AREA_M2

export const PATROL_GPS_ZONES: PatrolGpsZone[] = [
  {
    zone_id: PATROL_SITE_ZONE_ID,
    name: 'Khu vực 1',
    shortName: 'KV1',
    polygon: ZONE_1_POLYGON,
    area_m2: ZONE_1_AREA_M2,
    tier: 'primary',
    borderColor: '#ef4444',
    center: PATROL_ZONE_1_CENTER,
  },
  {
    zone_id: PATROL_SITE_ZONE_2_ID,
    name: 'Khu vực 2',
    shortName: 'KV2',
    polygon: ZONE_2_POLYGON,
    area_m2: ZONE_2_AREA_M2,
    tier: 'secondary',
    borderColor: '#22c55e',
    center: PATROL_ZONE_2_CENTER,
  },
]

export const PATROL_SITE_ZONE_SEED: PatrolZone[] = PATROL_GPS_ZONES.map(zone => ({
  id: zone.zone_id,
  name: zone.name,
  shortName: zone.shortName,
  coverage: 'NOT_VISITED',
  dwellSeconds: 420,
  peopleCurrent: 0,
  vehiclesCurrent: 0,
  uniquePeople: 0,
  uniqueVehicles: 0,
  areaSqm: zone.area_m2,
}))

/* ── Helmet GPS pins ────────────────────────────────────────── */
export interface PatrolHelmetPin {
  id: string
  label: string
  zoneId: string
  color: string
  position: [number, number]
}

export const PATROL_HELMET_ZONE_ASSIGNMENTS: readonly {
  helmetId: string
  zoneId: string
}[] = [
  { helmetId: 'HC-01', zoneId: PATROL_SITE_ZONE_ID },
  { helmetId: 'HC-02', zoneId: PATROL_SITE_ZONE_2_ID },
] as const

function buildHelmetPins(): PatrolHelmetPin[] {
  return (PATROL_HELMET_ZONE_ASSIGNMENTS as readonly { helmetId: string; zoneId: string }[]).map(({ helmetId, zoneId }) => {
    const zone = PATROL_GPS_ZONES.find(z => z.zone_id === zoneId)!
    const num = helmetId.replace('HC-', '')
    const position = helmetId === 'HC-01'
      ? PATROL_HELMET_01_FALLBACK
      : PATROL_HELMET_02_FALLBACK
    return {
      id: helmetId,
      label: `Helmet ${num}`,
      zoneId,
      color: zone.borderColor,
      position,
    }
  })
}

export const PATROL_HELMET_GPS_PINS: PatrolHelmetPin[] = buildHelmetPins()

export const PATROL_MAP_ACTIVE_HELMET_IDS = ['HC-01', 'HC-02'] as const

export const PATROL_MAP_ACTIVE_HELMET_PINS: PatrolHelmetPin[] = PATROL_HELMET_GPS_PINS.filter(
  pin => (PATROL_MAP_ACTIVE_HELMET_IDS as readonly string[]).includes(pin.id),
)

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
    zoneId: PATROL_SITE_ZONE_2_ID,
    color: PATROL_GPS_ZONES[1]?.borderColor ?? '#22c55e',
    position: [...PATROL_DRONE_03_FALLBACK],
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
  if (assignment) {
    const zone = PATROL_GPS_ZONES.find(z => z.zone_id === assignment.zoneId)
    return zone?.name ?? PATROL_SITE_NAME
  }
  return PATROL_SITE_NAME
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
  PATROL_SITE_CORNERS,
  PATROL_SITE_QUAD,
  PATROL_SURVEY_PIN,
  PATROL_ZONE_1_QUAD,
  PATROL_ZONE_2_QUAD,
  isPointInSiteBoundary,
  clampPointToSiteBoundary,
  clipPolygonToSiteBoundary,
  patrolSitePoint,
} from './patrolSiteGeometry'

const SITE_PAD = 0.0012

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

export const PATROL_SITE_DEFAULT_ZOOM = 15
export const PATROL_SITE_DEFAULT_ZOOM_MOBILE = 14

export const PATROL_SITE_MIN_ZOOM = 13
export const PATROL_SITE_MAX_ZOOM = 19
