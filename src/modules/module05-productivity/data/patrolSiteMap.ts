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

/* ── 8 GPS Zones ────────────────────────────────────────────── */
/**
 * Grid layout:
 *
 *  [ZONE_F ] [ZONE_C ] [ZONE_H ]
 *  [ZONE_A ] [ZONE_B ] [ZONE_E ]
 *  [ZONE_D ] [ZONE_G         ]
 */
export const PATROL_GPS_ZONES: PatrolGpsZone[] = [
  {
    zone_id: 'ZONE_A',
    name: 'Khu thi công móng',
    shortName: 'Móng',
    // Field-surveyed corners (TL→TR→BR→BL)
    polygon: [
      [21.003764, 105.947262],
      [21.003487, 105.947495],
      [21.003215, 105.947086],
      [21.003590, 105.947037],
    ],
    area_m2: 1200,
    tier: 'primary',
    borderColor: '#ef4444',
    center: [21.003514, 105.947220],
  },
  {
    zone_id: 'ZONE_B',
    name: 'Khu lắp dựng tầng',
    shortName: 'Tầng',
    // Interpolated — east of Móng, same row
    polygon: [
      [21.004007, 105.947472],
      [21.003702, 105.947735],
      [21.003454, 105.947350],
      [21.003801, 105.947188],
    ],
    area_m2: 850,
    tier: 'primary',
    borderColor: '#eab308',
    center: [21.003741, 105.947436],
  },
  {
    zone_id: 'ZONE_C',
    name: 'Khu hoàn thiện',
    shortName: 'HT',
    // Interpolated — north row, centre column
    polygon: [
      [21.004467, 105.947201],
      [21.004162, 105.947464],
      [21.003914, 105.947079],
      [21.004261, 105.946917],
    ],
    area_m2: 1450,
    tier: 'primary',
    borderColor: '#22c55e',
    center: [21.004201, 105.947165],
  },
  {
    zone_id: 'ZONE_D',
    name: 'Khu kho vật tư',
    shortName: 'Kho',
    // Field-surveyed corners (TL→TR→BR→BL)
    polygon: [
      [21.003335, 105.947520],
      [21.003004, 105.947813],
      [21.002779, 105.947453],
      [21.003098, 105.947179],
    ],
    area_m2: 600,
    tier: 'primary',
    borderColor: '#3b82f6',
    center: [21.003054, 105.947491],
  },
  {
    zone_id: 'ZONE_E',
    name: 'Khu văn phòng công trường',
    shortName: 'VP',
    // Field-surveyed corners (TL→TR→BR→BL)
    polygon: [
      [21.004405, 105.947320],
      [21.003780, 105.948162],
      [21.003531, 105.947989],
      [21.004156, 105.947137],
    ],
    area_m2: 400,
    tier: 'primary',
    borderColor: '#a855f7',
    center: [21.003968, 105.947652],
  },
  {
    zone_id: 'ZONE_F',
    name: 'Sân cẩu',
    shortName: 'Cẩu',
    // Interpolated — north row, west column (left of HT)
    polygon: [
      [21.004240, 105.946985],
      [21.003935, 105.947248],
      [21.003687, 105.946863],
      [21.004034, 105.946701],
    ],
    area_m2: 700,
    tier: 'secondary',
    borderColor: '#06b6d4',
    center: [21.003974, 105.946949],
  },
  {
    zone_id: 'ZONE_G',
    name: 'Cổng ra vào',
    shortName: 'Cổng',
    // Interpolated — south row, east of Kho
    polygon: [
      [21.003547, 105.947743],
      [21.003242, 105.948006],
      [21.002994, 105.947621],
      [21.003341, 105.947459],
    ],
    area_m2: 300,
    tier: 'secondary',
    borderColor: '#f59e0b',
    center: [21.003281, 105.947707],
  },
  {
    zone_id: 'ZONE_H',
    name: 'Khu đúc cọc',
    shortName: 'Cọc',
    // Interpolated — north row, east of HT
    polygon: [
      [21.004694, 105.947417],
      [21.004389, 105.947680],
      [21.004141, 105.947295],
      [21.004488, 105.947133],
    ],
    area_m2: 980,
    tier: 'secondary',
    borderColor: '#64748b',
    center: [21.004428, 105.947381],
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

/** Vòng tuần tra nhỏ trong khu phụ trách (~10 m bán kính). */
export function buildHelmetZoneTrail(
  center: [number, number],
  radiusM = 10,
  points = 60,
): [number, number][] {
  const [lat, lng] = center
  const latDelta = radiusM / 111_320
  const lngDelta = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180))
  const trail: [number, number][] = []
  for (let i = 0; i <= points; i++) {
    const angle = (i / points) * 2 * Math.PI
    trail.push([
      parseFloat((lat + latDelta * Math.sin(angle)).toFixed(6)),
      parseFloat((lng + lngDelta * Math.cos(angle)).toFixed(6)),
    ])
  }
  return trail
}

/** Lộ trình tuần tra theo khu — mỗi mũ 1 vòng trong zone được giao. */
export const PATROL_HELMET_ZONE_TRAILS: Record<string, [number, number][]> =
  Object.fromEntries(
    PATROL_HELMET_GPS_PINS.map(pin => {
      const zone = PATROL_GPS_ZONES.find(z => z.zone_id === pin.zoneId)!
      return [pin.id, buildHelmetZoneTrail(zone.center)]
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
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

const TRAIL_WAYPOINTS: [number, number][] = [
  [21.003514, 105.947220], // ZONE_A Móng
  [21.003741, 105.947436], // ZONE_B Tầng
  [21.003968, 105.947652], // ZONE_E VP
  [21.004428, 105.947381], // ZONE_H Cọc
  [21.004201, 105.947165], // ZONE_C HT
  [21.003974, 105.946949], // ZONE_F Cẩu
  [21.003054, 105.947491], // ZONE_D Kho
  [21.003281, 105.947707], // ZONE_G Cổng
  [21.003514, 105.947220], // back to A
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
 * Ranh giới toàn công trường — 4 góc thực đo ngoài hiện trường (rotated quad).
 * Thứ tự: TOP → RIGHT → BOTTOM → LEFT → TOP (đóng vòng).
 */
export const PATROL_SITE_BOUNDARY: [number, number][] = [
  [21.004587, 105.947314], // TOP
  [21.003598, 105.948614], // RIGHT
  [21.002343, 105.946914], // BOTTOM
  [21.003712, 105.945782], // LEFT
  [21.004587, 105.947314], // close
]

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
