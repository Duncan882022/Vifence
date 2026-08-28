/** Module 05 — Site Map: GPS zones, helmet pins, patrol trail.
 *  Coordinate system: [lat, lng] throughout (Leaflet convention).
 *
 *  Công trường: Cầu Sông Hốt
 *  Center: 20.933094°N, 106.923950°E
 *  ROI: PATROL_SITE_CORNERS in patrolSiteGeometry.ts
 */

import {
  clipPolygonToSiteBoundary,
  PATROL_SITE_CORNERS,
} from './patrolSiteGeometry'
import type { PatrolZone } from './patrolTypes'

export const PATROL_SITE_NAME = 'Cầu Sông Hốt'
export const PATROL_SITE_ZONE_ID = 'ZONE_SITE'

/** Map centre — tọa độ mặc định công trường. */
export const PATROL_SITE_CENTER: [number, number] = [20.933094, 106.923950]

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

/** HC-01 không GPS → neo tây-nam công trường. */
export const PATROL_HELMET_01_FALLBACK: [number, number] = patrolZoneInteriorPoint(
  _SITE_POLY,
  0.18,
  0.22,
)

/** HC-02 không GPS → neo đông-bắc (~120m+ tách HC-01). */
export const PATROL_HELMET_02_FALLBACK: [number, number] = patrolZoneInteriorPoint(
  _SITE_POLY,
  0.82,
  0.78,
)

/** DR-03 không GPS → neo phía bắc giữa công trường. */
export const PATROL_DRONE_03_FALLBACK: [number, number] = patrolZoneInteriorPoint(
  _SITE_POLY,
  0.52,
  0.12,
)

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

/**
 * Chưa chia khu — một zone duy nhất = 4 góc survey công trường.
 */
const SITE_ZONE_RAW = [...PATROL_SITE_CORNERS] as [number, number][]

export const PATROL_SITE_AREA_M2 = 98_000

export const PATROL_GPS_ZONES: PatrolGpsZone[] = [
  buildGpsZone(
    PATROL_SITE_ZONE_ID,
    PATROL_SITE_NAME,
    PATROL_SITE_NAME,
    SITE_ZONE_RAW,
    PATROL_SITE_AREA_M2,
    'primary',
    '#ef4444',
  ),
]

/** Chưa chia khu — một zone = công trường; seed cho bộ đếm zone live trên bản đồ. */
export const PATROL_SITE_ZONE_SEED: PatrolZone[] = [
  {
    id: PATROL_SITE_ZONE_ID,
    name: PATROL_SITE_NAME,
    shortName: PATROL_SITE_NAME,
    coverage: 'VISITED',
    dwellSeconds: 624,
    peopleCurrent: 42,
    vehiclesCurrent: 8,
    uniquePeople: 58,
    uniqueVehicles: 11,
    areaSqm: PATROL_SITE_AREA_M2,
  },
]

/* ── Helmet GPS pins ────────────────────────────────────────── */
export interface PatrolHelmetPin {
  id: string
  label: string
  zoneId: string
  color: string
  /** Initial GPS position [lat, lng]. Updated via WS camera_position events. */
  position: [number, number]
}

/** Khu phụ trách — chỉ HC-01 + HC-02 (Cầu Sông Hốt). */
export const PATROL_HELMET_ZONE_ASSIGNMENTS: readonly {
  helmetId: string
  zoneId: string
}[] = [
  { helmetId: 'HC-01', zoneId: PATROL_SITE_ZONE_ID },
  { helmetId: 'HC-02', zoneId: PATROL_SITE_ZONE_ID },
] as const

function buildHelmetPins(): PatrolHelmetPin[] {
  const zone = PATROL_GPS_ZONES[0]
  return (PATROL_HELMET_ZONE_ASSIGNMENTS as readonly { helmetId: string; zoneId: string }[]).map(({ helmetId, zoneId }) => {
    const num = helmetId.replace('HC-', '')
    return {
      id: helmetId,
      label: `Helmet ${num}`,
      zoneId,
      color: zone.borderColor,
      position: PATROL_SITE_CENTER,
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
    color: PATROL_GPS_ZONES[0]?.borderColor ?? '#ef4444',
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
  void helmetId
  return PATROL_SITE_NAME
}

export function buildPatrolGpsTrail(stepsPerSegment = 10): [number, number][] {
  const zone = PATROL_GPS_ZONES[0]
  const ring = zone.polygon.length >= 4 ? zone.polygon : [...PATROL_SITE_CORNERS]
  const waypoints = [...ring.slice(0, 4), ring[0]]
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
  PATROL_SITE_CLIP_RING,
  isPointInSiteBoundary,
  clampPointToSiteBoundary,
  clipPolygonToSiteBoundary,
} from './patrolSiteGeometry'

const SITE_PAD = 0.00085

/** Giới hạn pan/zoom — chỉ trong phạm vi công trường [SW, NE]. */
export const PATROL_SITE_FOCUS_BOUNDS: [[number, number], [number, number]] = [
  [
    Math.min(...PATROL_SITE_CORNERS.map(p => p[0])) - SITE_PAD,
    Math.min(...PATROL_SITE_CORNERS.map(p => p[1])) - SITE_PAD,
  ],
  [
    Math.max(...PATROL_SITE_CORNERS.map(p => p[0])) + SITE_PAD,
    Math.max(...PATROL_SITE_CORNERS.map(p => p[1])) + SITE_PAD,
  ],
]

export const PATROL_SITE_MIN_ZOOM = 15
export const PATROL_SITE_MAX_ZOOM = 19

/* ── Legacy exports (backward compat) ── */

export type PatrolZoneDisplayTier = 'primary' | 'secondary'

export interface PatrolHeatmapZoneShape {
  id: string
  label: string
  sublabel: string
  polygon: { x: number; y: number }[]
  cx: number
  cy: number
  displayTier: PatrolZoneDisplayTier
  borderColor: string
  cardAnchor: { x: number; y: number }
}

/** @deprecated — dùng PATROL_GPS_ZONES */
export const PATROL_HEATMAP_ZONE_SHAPES: PatrolHeatmapZoneShape[] = [
  {
    id: PATROL_SITE_ZONE_ID,
    label: PATROL_SITE_ZONE_ID,
    sublabel: PATROL_SITE_NAME,
    polygon: [{ x: 12, y: 14 }, { x: 88, y: 12 }, { x: 86, y: 86 }, { x: 10, y: 88 }],
    cx: 50,
    cy: 50,
    displayTier: 'primary',
    borderColor: '#ef4444',
    cardAnchor: { x: 50, y: 50 },
  },
]

export const PATROL_PRIMARY_ZONE_IDS = PATROL_GPS_ZONES
  .filter(z => z.tier === 'primary')
  .map(z => z.zone_id)

/** @deprecated */
export const PATROL_ZONE_SHAPES = PATROL_HEATMAP_ZONE_SHAPES

export function getPatrolZoneShape(zoneId: string): PatrolHeatmapZoneShape | undefined {
  return PATROL_HEATMAP_ZONE_SHAPES.find(z => z.id === zoneId)
}

/** @deprecated */
export const PATROL_HELMET_MARKERS = [
  { id: 'HC-01', zoneId: PATROL_SITE_ZONE_ID, label: 'HC-01', x: 45, y: 48, color: '#ef4444' },
  { id: 'HC-02', zoneId: PATROL_SITE_ZONE_ID, label: 'HC-02', x: 55, y: 52, color: '#ef4444' },
] as const

export const PATROL_HELMET_IDS = PATROL_HELMET_GPS_PINS.map(p => p.id)

export const PATROL_HELMET_ROUTE = PATROL_HELMET_MARKERS.map((marker, index) => ({
  ...marker,
  order: index,
}))

export function buildPatrolRouteSegments(
  markers: typeof PATROL_HELMET_MARKERS = PATROL_HELMET_MARKERS,
): { x1: number; y1: number; x2: number; y2: number; color: string }[] {
  const segments: { x1: number; y1: number; x2: number; y2: number; color: string }[] = []
  for (let i = 0; i < markers.length - 1; i += 1) {
    const from = markers[i]
    const to = markers[i + 1]
    segments.push({ x1: from.x, y1: from.y, x2: to.x, y2: to.y, color: from.color })
  }
  return segments
}

export const PATROL_TRAIL_ZONE_IDS = [PATROL_SITE_ZONE_ID] as const

/** @deprecated */
export const PATROL_HELMET_MAP_PINS: Record<string, { zoneId: string; label: string }> =
  Object.fromEntries(PATROL_HELMET_MARKERS.map(m => [m.id, { zoneId: m.zoneId, label: m.label }]))
