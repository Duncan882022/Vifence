/** Module 05 — Site Map: GPS zones, helmet pins, patrol trail.
 *  Coordinate system: [lat, lng] throughout (Leaflet convention).
 *  GeoJSON consumers must swap to [lng, lat] per RFC 7946.
 *
 *  Site: Vinhomes Ocean Park 1 (OCP1), Gia Lâm, Hà Nội
 *  Center: 21.003560°N, 105.947157°E
 *  Site perimeter (rotated quad — corners from field survey):
 *    TOP  21.004587, 105.947314  |  RIGHT 21.003598, 105.948614
 *    LEFT 21.003712, 105.945782  |  BOT   21.002343, 105.946914
 */

/** Field-surveyed polygons — fixed, do not regenerate. */
const SURVEYED_ZONE_POLYGONS = {
  ZONE_A: [
    [21.003764, 105.947262],
    [21.003487, 105.947495],
    [21.003215, 105.947086],
    [21.003590, 105.947037],
  ],
  ZONE_D: [
    [21.003335, 105.947520],
    [21.003004, 105.947813],
    [21.002779, 105.947453],
    [21.003098, 105.947179],
  ],
  ZONE_E: [
    [21.004405, 105.947320],
    [21.003780, 105.948162],
    [21.003531, 105.947989],
    [21.004156, 105.947137],
  ],
} as const satisfies Record<string, [number, number][]>

/**
 * Interpolated polygons — hand-placed in gaps between surveyed zones.
 * Validated: no bbox overlap with ZONE_A/D/E or each other.
 */
const INTERP_ZONE_POLYGONS = {
  ZONE_B: [
    [21.003250, 105.946760],
    [21.003760, 105.946760],
    [21.003760, 105.946960],
    [21.003250, 105.946960],
  ],
  ZONE_C: [
    [21.003800, 105.946060],
    [21.004080, 105.946060],
    [21.004080, 105.946720],
    [21.003800, 105.946720],
  ],
  ZONE_F: [
    [21.004130, 105.946060],
    [21.004587, 105.946720],
    [21.004120, 105.946720],
    [21.004120, 105.946060],
  ],
  ZONE_G: [
    [21.002550, 105.945800],
    [21.003220, 105.946420],
    [21.002600, 105.946180],
    [21.002950, 105.945780],
  ],
  ZONE_H: [
    [21.004405, 105.948150],
    [21.004350, 105.948550],
    [21.003760, 105.948400],
    [21.003760, 105.948150],
  ],
} as const satisfies Record<string, [number, number][]>

import { clipPolygonToSiteBoundary } from './patrolSiteGeometry'

function polygonCenter(polygon: [number, number][]): [number, number] {
  if (polygon.length === 0) return [21.00356, 105.947157]
  const lat = polygon.reduce((s, p) => s + p[0], 0) / polygon.length
  const lng = polygon.reduce((s, p) => s + p[1], 0) / polygon.length
  return [parseFloat(lat.toFixed(6)), parseFloat(lng.toFixed(6))]
}

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

function buildZonePolygon(raw: readonly [number, number][]): [number, number][] {
  return clipPolygonToSiteBoundary([...raw])
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
  const polygon = buildZonePolygon(rawPolygon)
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

/* ── 8 GPS Zones ────────────────────────────────────────────── */
/**
 * Layout (geographic, no overlap):
 *
 *  [ Cẩu F ] [ HT C  ] [ Cọc H ]     ← west / north / NE tip
 *  [ Móng A] [ Tầng B] [ VP  E ]     ← surveyed A + interp B + surveyed E
 *  [ Kho D ] [    Cổng G          ]  ← surveyed D + interp G
 *
 *  ZONE_A / D / E: field-surveyed (fixed)
 *  ZONE_B / C / F / G / H: interpolated in remaining gaps
 */
export const PATROL_GPS_ZONES: PatrolGpsZone[] = [
  buildGpsZone('ZONE_A', 'Khu thi công móng', 'Móng', SURVEYED_ZONE_POLYGONS.ZONE_A, 1200, 'primary', '#ef4444'),
  buildGpsZone('ZONE_B', 'Khu lắp dựng tầng', 'Tầng', INTERP_ZONE_POLYGONS.ZONE_B, 850, 'primary', '#eab308'),
  buildGpsZone('ZONE_C', 'Khu hoàn thiện', 'HT', INTERP_ZONE_POLYGONS.ZONE_C, 1450, 'primary', '#22c55e'),
  buildGpsZone('ZONE_D', 'Khu kho vật tư', 'Kho', SURVEYED_ZONE_POLYGONS.ZONE_D, 600, 'primary', '#3b82f6'),
  buildGpsZone('ZONE_E', 'Khu văn phòng công trường', 'VP', SURVEYED_ZONE_POLYGONS.ZONE_E, 400, 'primary', '#a855f7'),
  buildGpsZone('ZONE_F', 'Sân cẩu', 'Cẩu', INTERP_ZONE_POLYGONS.ZONE_F, 700, 'secondary', '#06b6d4'),
  buildGpsZone('ZONE_G', 'Cổng ra vào', 'Cổng', INTERP_ZONE_POLYGONS.ZONE_G, 300, 'secondary', '#f59e0b'),
  buildGpsZone('ZONE_H', 'Khu đúc cọc', 'Cọc', INTERP_ZONE_POLYGONS.ZONE_H, 980, 'secondary', '#64748b'),
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

/** Khu phụ trách của từng mũ — 5 helmet / 5 zone chính. */
export const PATROL_HELMET_ZONE_ASSIGNMENTS: readonly {
  helmetId: string
  zoneId: string
}[] = [
  { helmetId: 'HC-01', zoneId: 'ZONE_A' },
  { helmetId: 'HC-02', zoneId: 'ZONE_B' },
  { helmetId: 'HC-03', zoneId: 'ZONE_C' },
  { helmetId: 'HC-04', zoneId: 'ZONE_D' },
  { helmetId: 'HC-05', zoneId: 'ZONE_E' },
] as const

function buildHelmetPins(): PatrolHelmetPin[] {
  return (PATROL_HELMET_ZONE_ASSIGNMENTS as readonly { helmetId: string; zoneId: string }[]).map(({ helmetId, zoneId }) => {
    const zone = PATROL_GPS_ZONES.find(z => z.zone_id === zoneId)
    if (!zone) throw new Error(`Missing zone ${zoneId} for ${helmetId}`)
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

/** Tạm chỉ HC-01 + HC-02 trên heatmap (ẩn giả lập HC-03…05). */
export const PATROL_MAP_ACTIVE_HELMET_IDS = ['HC-01', 'HC-02'] as const

export const PATROL_MAP_ACTIVE_HELMET_PINS: PatrolHelmetPin[] = PATROL_HELMET_GPS_PINS.filter(
  pin => (PATROL_MAP_ACTIVE_HELMET_IDS as readonly string[]).includes(pin.id),
)

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
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

/**
 * Lộ trình tuần tra tự nhiên trong zone — zigzag nội bộ, không vòng tròn.
 * Mỗi mũ lệch phase để 5 route không trùng nhau.
 */
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

/** Lộ trình tuần tra theo khu — mỗi mũ zigzag trong polygon zone được giao. */
export const PATROL_HELMET_ZONE_TRAILS: Record<string, [number, number][]> =
  Object.fromEntries(
    PATROL_HELMET_GPS_PINS.map(pin => {
      const zone = PATROL_GPS_ZONES.find(z => z.zone_id === pin.zoneId)!
      const phase = parseInt(pin.id.replace('HC-', ''), 10) - 1
      return [pin.id, buildHelmetZoneTrail(zone.polygon, phase)]
    }),
  )

export function getPatrolHelmetZoneName(helmetId: string): string {
  const pin = PATROL_HELMET_GPS_PINS.find(p => p.id === helmetId)
  if (!pin) return helmetId
  return PATROL_GPS_ZONES.find(z => z.zone_id === pin.zoneId)?.name ?? pin.zoneId
}

/* ── GPS Patrol Trail ────────────────────────────────────────── */
/**
 * Generates 80 GPS points (2s interval) forming a patrol loop:
 * A → B → E → H → C → F → D → G → A
 *
 * Each waypoint is a zone centre; 10 steps between each.
 */
const TRAIL_ZONE_IDS = ['ZONE_A', 'ZONE_B', 'ZONE_E', 'ZONE_H', 'ZONE_C', 'ZONE_F', 'ZONE_D', 'ZONE_G'] as const

function zoneCenter(zoneId: string): [number, number] {
  const z = PATROL_GPS_ZONES.find(g => g.zone_id === zoneId)
  if (!z) throw new Error(`Missing zone ${zoneId}`)
  return z.center
}

const TRAIL_WAYPOINTS: [number, number][] = [
  ...TRAIL_ZONE_IDS.map(zoneCenter),
  zoneCenter('ZONE_A'),
]

export function buildPatrolGpsTrail(stepsPerSegment = 10): [number, number][] {
  const trail: [number, number][] = []
  for (let i = 0; i < TRAIL_WAYPOINTS.length - 1; i++) {
    const [lat1, lng1] = TRAIL_WAYPOINTS[i]
    const [lat2, lng2] = TRAIL_WAYPOINTS[i + 1]
    for (let s = 0; s < stepsPerSegment; s++) {
      const t = s / stepsPerSegment
      trail.push([
        parseFloat(lerp(lat1, lat2, t).toFixed(6)),
        parseFloat(lerp(lng1, lng2, t).toFixed(6)),
      ])
    }
  }
  return trail
}

/** Flat list of GPS trail positions (used for polyline rendering). */
export const PATROL_GPS_TRAIL = buildPatrolGpsTrail()

/**
 * Ranh giới toàn công trường — re-export from patrolSiteGeometry.
 */
export {
  PATROL_SITE_BOUNDARY,
  PATROL_SITE_CLIP_RING,
  isPointInSiteBoundary,
  clampPointToSiteBoundary,
  clipPolygonToSiteBoundary,
} from './patrolSiteGeometry'

/** Map centre for Leaflet MapContainer — geometric centroid of the site quad. */
export const PATROL_SITE_CENTER: [number, number] = [21.003560, 105.947157]

/** Giới hạn pan/zoom — chỉ trong phạm vi công trường [SW, NE]. */
export const PATROL_SITE_FOCUS_BOUNDS: [[number, number], [number, number]] = [
  [21.001800, 105.944900],
  [21.005300, 105.949500],
]

export const PATROL_SITE_MIN_ZOOM = 15
export const PATROL_SITE_MAX_ZOOM = 19

/* ── Legacy exports (kept for backward compat with old SVG components) ── */

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
  { id: 'ZONE_A', label: 'ZONE_A', sublabel: 'Khu thi công móng', polygon: [{ x: 10, y: 18 }, { x: 34, y: 16 }, { x: 36, y: 38 }, { x: 12, y: 40 }], cx: 23, cy: 28, displayTier: 'primary', borderColor: '#ef4444', cardAnchor: { x: 23, y: 28 } },
  { id: 'ZONE_B', label: 'ZONE_B', sublabel: 'Khu lắp dựng tầng', polygon: [{ x: 36, y: 12 }, { x: 58, y: 12 }, { x: 56, y: 34 }, { x: 34, y: 36 }], cx: 45, cy: 23, displayTier: 'primary', borderColor: '#eab308', cardAnchor: { x: 45, y: 23 } },
  { id: 'ZONE_C', label: 'ZONE_C', sublabel: 'Khu hoàn thiện', polygon: [{ x: 58, y: 22 }, { x: 82, y: 24 }, { x: 80, y: 46 }, { x: 56, y: 44 }], cx: 69, cy: 34, displayTier: 'primary', borderColor: '#22c55e', cardAnchor: { x: 69, y: 34 } },
  { id: 'ZONE_D', label: 'ZONE_D', sublabel: 'Khu kho vật tư', polygon: [{ x: 8, y: 52 }, { x: 30, y: 50 }, { x: 32, y: 72 }, { x: 10, y: 74 }], cx: 20, cy: 62, displayTier: 'primary', borderColor: '#3b82f6', cardAnchor: { x: 20, y: 62 } },
  { id: 'ZONE_E', label: 'ZONE_E', sublabel: 'Khu VP công trường', polygon: [{ x: 34, y: 54 }, { x: 54, y: 52 }, { x: 52, y: 74 }, { x: 32, y: 76 }], cx: 43, cy: 63, displayTier: 'primary', borderColor: '#a855f7', cardAnchor: { x: 43, y: 63 } },
  { id: 'ZONE_F', label: 'ZONE_F', sublabel: 'Sân cẩu', polygon: [{ x: 54, y: 52 }, { x: 72, y: 50 }, { x: 74, y: 72 }, { x: 56, y: 74 }], cx: 63, cy: 62, displayTier: 'secondary', borderColor: '#64748b', cardAnchor: { x: 63, y: 62 } },
  { id: 'ZONE_G', label: 'ZONE_G', sublabel: 'Cổng ra vào', polygon: [{ x: 66, y: 8 }, { x: 88, y: 8 }, { x: 88, y: 22 }, { x: 66, y: 22 }], cx: 77, cy: 15, displayTier: 'secondary', borderColor: '#64748b', cardAnchor: { x: 77, y: 15 } },
  { id: 'ZONE_H', label: 'ZONE_H', sublabel: 'Khu đúc cọc', polygon: [{ x: 10, y: 38 }, { x: 34, y: 36 }, { x: 32, y: 50 }, { x: 8, y: 52 }], cx: 21, cy: 44, displayTier: 'secondary', borderColor: '#64748b', cardAnchor: { x: 21, y: 44 } },
]

export const PATROL_PRIMARY_ZONE_IDS = PATROL_GPS_ZONES
  .filter(z => z.tier === 'primary')
  .map(z => z.zone_id)

/** @deprecated */
export const PATROL_ZONE_SHAPES = PATROL_HEATMAP_ZONE_SHAPES

export function getPatrolZoneShape(zoneId: string): PatrolHeatmapZoneShape | undefined {
  return PATROL_HEATMAP_ZONE_SHAPES.find(z => z.id === zoneId)
}

/** @deprecated — dùng PATROL_HELMET_GPS_PINS */
export const PATROL_HELMET_MARKERS = [
  { id: 'HC-01', zoneId: 'ZONE_A', label: 'HC-01', x: 23, y: 30, color: '#ef4444' },
  { id: 'HC-02', zoneId: 'ZONE_B', label: 'HC-02', x: 45, y: 25, color: '#eab308' },
  { id: 'HC-03', zoneId: 'ZONE_C', label: 'HC-03', x: 69, y: 36, color: '#22c55e' },
  { id: 'HC-04', zoneId: 'ZONE_D', label: 'HC-04', x: 20, y: 64, color: '#3b82f6' },
  { id: 'HC-05', zoneId: 'ZONE_E', label: 'HC-05', x: 43, y: 65, color: '#a855f7' },
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

export const PATROL_TRAIL_ZONE_IDS = ['ZONE_A', 'ZONE_B', 'ZONE_C', 'ZONE_D', 'ZONE_E'] as const

/** @deprecated */
export const PATROL_HELMET_MAP_PINS: Record<string, { zoneId: string; label: string }> =
  Object.fromEntries(PATROL_HELMET_MARKERS.map(m => [m.id, { zoneId: m.zoneId, label: m.label }]))
