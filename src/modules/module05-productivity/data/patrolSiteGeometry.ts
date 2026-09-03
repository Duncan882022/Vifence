/**
 * Site boundary geometry — shared by zones, detection, density clip rules.
 * Coordinate system: [lat, lng] (Leaflet convention).
 *
 * Dự án Cầu Sông Hốt — hành lang CT06 cong theo khảo sát (4 điểm neo GPS).
 */

const M_PER_DEG_LAT = 111_320

/** Bo tròn A — đỉnh tây (Đình Trung Bản). */
export const PATROL_SITE_TIP_A: [number, number] = [20.907474, 106.830878]

/** Bo tròn B — đỉnh đông (Bệnh viện Sản Nhi). */
export const PATROL_SITE_TIP_B: [number, number] = [20.962517, 106.945303]

/** Điểm thắt dưới — mép nam (Đảo Hoàng Tân). */
export const PATROL_SITE_PINCH_SOUTH: [number, number] = [20.928673, 106.893158]

/** Điểm thắt trên — mép bắc. */
export const PATROL_SITE_PINCH_NORTH: [number, number] = [20.953546, 106.879254]

/** Ghim khảo sát Bùi Xá — DR-03 / ZONE_3. */
export const PATROL_SURVEY_PIN: [number, number] = [20.928444, 106.873611]

/** Lượn nam ghim Bùi Xá — mép nam cong vào trong theo ảnh khảo sát. */
export const PATROL_SURVEY_SOUTH_BEND: [number, number] = [
  parseFloat((PATROL_SURVEY_PIN[0] - 0.0018).toFixed(6)),
  PATROL_SURVEY_PIN[1],
]

/** Bbox bilinear legacy — zoom / fallback. */
export const PATROL_SITE_CORNERS: [number, number][] = [
  [
    Math.max(PATROL_SITE_TIP_A[0], PATROL_SITE_PINCH_NORTH[0]),
    Math.min(PATROL_SITE_TIP_A[1], PATROL_SITE_PINCH_SOUTH[1]),
  ],
  [
    Math.max(PATROL_SITE_TIP_B[0], PATROL_SITE_PINCH_NORTH[0]),
    Math.max(PATROL_SITE_TIP_B[1], PATROL_SITE_PINCH_SOUTH[1]),
  ],
  [
    Math.min(PATROL_SITE_TIP_A[0], PATROL_SITE_PINCH_SOUTH[0]),
    Math.max(PATROL_SITE_TIP_B[1], PATROL_SITE_PINCH_SOUTH[1]),
  ],
  [
    Math.min(PATROL_SITE_TIP_A[0], PATROL_SITE_PINCH_SOUTH[0]),
    Math.min(PATROL_SITE_TIP_A[1], PATROL_SITE_PINCH_SOUTH[1]),
  ],
]

/** Bán kính nửa hình tròn 2 đầu capsule (stadium) — mép phẳng nối spine tại attach point. */
const END_CAP_RADIUS_M = 1360

/** Độ lượn bắc trục CT06 so với đường thẳng tây–đông (m). */
const SPINE_BOW_NORTH_M = 320

const CAP_RADIUS_SCALE_WEST = 0.35
function latLngToEnu(
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

function enuToLatLng(
  east: number,
  north: number,
  refLat: number,
  refLng: number,
): [number, number] {
  const cosLat = Math.cos((refLat * Math.PI) / 180)
  const lat = refLat + north / M_PER_DEG_LAT
  const lng = refLng + east / (M_PER_DEG_LAT * Math.max(cosLat, 1e-6))
  return [parseFloat(lat.toFixed(6)), parseFloat(lng.toFixed(6))]
}

function lerpPt(a: [number, number], b: [number, number], t: number): [number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

function subPt(a: [number, number], b: [number, number]): [number, number] {
  return [a[0] - b[0], a[1] - b[1]]
}

function addPt(a: [number, number], b: [number, number]): [number, number] {
  return [a[0] + b[0], a[1] + b[1]]
}

function scalePt(v: [number, number], s: number): [number, number] {
  return [v[0] * s, v[1] * s]
}

function normalizePt(v: [number, number]): [number, number] {
  const len = Math.hypot(v[0], v[1]) || 1
  return [v[0] / len, v[1] / len]
}

function perpPt(v: [number, number]): [number, number] {
  return [-v[1], v[0]]
}

function dotPt(a: [number, number], b: [number, number]): number {
  return a[0] * b[0] + a[1] * b[1]
}

type LngLat = [number, number] // [lng, lat]

function cross2d(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
}

function isInsideSiteRing(lat: number, lng: number, ring: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [yi, xi] = ring[i]
    const [yj, xj] = ring[j]
    const intersects = (yi > lat) !== (yj > lat)
      && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

/** Catmull-Rom — mép nam/bắc cong qua điểm neo. */
function catmullRomChain(
  points: [number, number][],
  samplesPerSeg = 22,
): [number, number][] {
  const out: [number, number][] = []
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(points.length - 1, i + 2)]
    for (let s = 0; s < samplesPerSeg; s += 1) {
      const t = s / samplesPerSeg
      const t2 = t * t
      const t3 = t2 * t
      out.push([
        0.5
          * ((2 * p1[0])
            + (-p0[0] + p2[0]) * t
            + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2
            + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5
          * ((2 * p1[1])
            + (-p0[1] + p2[1]) * t
            + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2
            + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ])
    }
  }
  out.push(points[points.length - 1])
  return out
}

/** Nửa hình tròn 2 đầu — cung đi qua đỉnh bo A/B. */
function capArcThroughApex(
  apex: [number, number],
  south: [number, number],
  north: [number, number],
  steps = 26,
): [number, number][] {
  const mid = lerpPt(south, north, 0.5)
  const inward = normalizePt(subPt(mid, apex))
  const radius = Math.abs(dotPt(subPt(mid, apex), inward))
  const center = addPt(apex, scalePt(inward, radius))
  const angleSouth = Math.atan2(south[1] - center[1], south[0] - center[0])
  const angleNorth = Math.atan2(north[1] - center[1], north[0] - center[0])
  const angleApex = Math.atan2(apex[1] - center[1], apex[0] - center[0])

  let sweepShort = angleNorth - angleSouth
  while (sweepShort <= 0) sweepShort += Math.PI * 2
  const sweepLong = sweepShort - Math.PI * 2

  function sweepContainsApex(sweep: number): boolean {
    for (let k = 0; k <= 100; k += 1) {
      const ang = angleSouth + sweep * (k / 100)
      let delta = ang - angleApex
      while (delta > Math.PI) delta -= Math.PI * 2
      while (delta < -Math.PI) delta += Math.PI * 2
      if (Math.abs(delta) < 0.05) return true
    }
    return false
  }

  const sweep = sweepContainsApex(sweepShort) ? sweepShort : sweepLong
  const pts: [number, number][] = []
  for (let i = 0; i <= steps; i += 1) {
    const ang = angleSouth + (sweep * i) / steps
    pts.push([
      center[0] + radius * Math.cos(ang),
      center[1] + radius * Math.sin(ang),
    ])
  }
  return pts
}

interface ArcLengthTable {
  curve: [number, number][]
  cumulative: number[]
  total: number
}

function buildArcLengthTable(curve: [number, number][]): ArcLengthTable {
  const cumulative = [0]
  for (let i = 1; i < curve.length; i += 1) {
    cumulative.push(
      cumulative[i - 1]
        + Math.hypot(curve[i][0] - curve[i - 1][0], curve[i][1] - curve[i - 1][1]),
    )
  }
  return { curve, cumulative, total: cumulative[cumulative.length - 1] ?? 0 }
}

function pointAtArcU(table: ArcLengthTable, u: number): [number, number] {
  if (table.curve.length === 0) return [0, 0]
  if (table.total <= 0) return table.curve[0]
  const target = Math.max(0, Math.min(1, u)) * table.total
  let i = 1
  while (i < table.cumulative.length && table.cumulative[i] < target) i += 1
  const i0 = Math.max(0, i - 1)
  const span = table.cumulative[i] - table.cumulative[i0]
  const frac = span > 0 ? (target - table.cumulative[i0]) / span : 0
  const a = table.curve[i0]
  const b = table.curve[Math.min(table.curve.length - 1, i)]
  return [a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac]
}

interface CurvedCorridorModel {
  ring: [number, number][]
  westCapRing: [number, number][]
  eastCapRing: [number, number][]
  southTable: ArcLengthTable
  northTable: ArcLengthTable
  refLat: number
  refLng: number
}

function buildCurvedCorridorModel(): CurvedCorridorModel {
  const refLat = (PATROL_SITE_TIP_A[0] + PATROL_SITE_TIP_B[0]) / 2
  const refLng = (PATROL_SITE_TIP_A[1] + PATROL_SITE_TIP_B[1]) / 2

  const tipA = latLngToEnu(PATROL_SITE_TIP_A[0], PATROL_SITE_TIP_A[1], refLat, refLng)
  const tipB = latLngToEnu(PATROL_SITE_TIP_B[0], PATROL_SITE_TIP_B[1], refLat, refLng)
  const pinchS = latLngToEnu(PATROL_SITE_PINCH_SOUTH[0], PATROL_SITE_PINCH_SOUTH[1], refLat, refLng)
  const pinchN = latLngToEnu(PATROL_SITE_PINCH_NORTH[0], PATROL_SITE_PINCH_NORTH[1], refLat, refLng)
  const southBend = latLngToEnu(PATROL_SURVEY_SOUTH_BEND[0], PATROL_SURVEY_SOUTH_BEND[1], refLat, refLng)
  const survey = latLngToEnu(PATROL_SURVEY_PIN[0], PATROL_SURVEY_PIN[1], refLat, refLng)

  const midPinch = lerpPt(pinchS, pinchN, 0.5)
  const inwardA = normalizePt(subPt(midPinch, tipA))
  const inwardB = normalizePt(subPt(midPinch, tipB))
  const attachA = addPt(tipA, scalePt(inwardA, END_CAP_RADIUS_M))
  const attachB = addPt(tipB, scalePt(inwardB, END_CAP_RADIUS_M))
  const bowMid = addPt(lerpPt(attachA, attachB, 0.5), [0, SPINE_BOW_NORTH_M])

  const surveySouthHalf = Math.hypot(southBend[0] - survey[0], southBend[1] - survey[1])
  const surveyBulgeExtraM = 300
  const pinchArcT = 0.587

  const spineControls: [number, number][] = [
    attachA,
    lerpPt(attachA, survey, 0.5),
    lerpPt(survey, bowMid, 0.35),
    lerpPt(bowMid, attachB, 0.65),
    attachB,
  ]
  const spine = catmullRomChain(spineControls, 18)

  const halfSouthKeys = [
    { t: 0, half: END_CAP_RADIUS_M },
    { t: 0.14, half: END_CAP_RADIUS_M * 0.84 },
    { t: 0.36, half: surveySouthHalf + surveyBulgeExtraM },
    { t: 0.425, half: surveySouthHalf + surveyBulgeExtraM * 0.55 },
    { t: pinchArcT, half: 1430 },
    { t: 1, half: END_CAP_RADIUS_M },
  ]
  const halfNorthKeys = [
    { t: 0, half: END_CAP_RADIUS_M * 0.96 },
    { t: pinchArcT, half: 1820 },
    { t: 1, half: END_CAP_RADIUS_M * 0.96 },
  ]

  function halfAt(keys: { t: number; half: number }[], t: number): number {
    let half = keys[keys.length - 1].half
    for (let k = 0; k < keys.length - 1; k += 1) {
      const a = keys[k]
      const b = keys[k + 1]
      if (t >= a.t && t <= b.t) {
        const f = (t - a.t) / Math.max(1e-6, b.t - a.t)
        half = a.half + (b.half - a.half) * f
        break
      }
    }
    return half
  }

  const southEdge: [number, number][] = []
  const northEdge: [number, number][] = []
  const n = spine.length

  for (let i = 0; i < n; i += 1) {
    const t = i / Math.max(1, n - 1)
    const halfS = halfAt(halfSouthKeys, t)
    const halfN = halfAt(halfNorthKeys, t)

    const prev = spine[Math.max(0, i - 1)]
    const next = spine[Math.min(n - 1, i + 1)]
    const tangent = normalizePt(subPt(next, prev))
    const normal = perpPt(tangent)

    southEdge.push(addPt(spine[i], scalePt(normal, -halfS)))
    northEdge.push(addPt(spine[i], scalePt(normal, halfN)))
  }

  const westCap = capArcThroughApex(tipA, southEdge[0], northEdge[0], 36)
  const eastCap = capArcThroughApex(tipB, northEdge[n - 1], southEdge[n - 1], 36)

  const westCapRing = westCap.map(([e, nIdx]) => enuToLatLng(e, nIdx, refLat, refLng))
  const eastCapRing = eastCap.map(([e, nIdx]) => enuToLatLng(e, nIdx, refLat, refLng))

  const ringEnu: [number, number][] = [
    ...westCap.slice(0, -1),
    ...northEdge.slice(1, -1),
    ...eastCap.slice(0, -1),
    ...southEdge.slice(1).reverse(),
  ]

  let ring = ringEnu.map(([e, nIdx]) => enuToLatLng(e, nIdx, refLat, refLng))
  if (!isInsideSiteRing(PATROL_SURVEY_PIN[0], PATROL_SURVEY_PIN[1], ring)) {
    ring = [...ring].reverse()
  }

  return {
    ring,
    westCapRing,
    eastCapRing,
    southTable: buildArcLengthTable(southEdge),
    northTable: buildArcLengthTable(northEdge),
    refLat,
    refLng,
  }
}

const CORRIDOR_MODEL = buildCurvedCorridorModel()

/**
 * Viền đỏ heatmap — hành lang cong (~200 đỉnh), ngược chiều kim đồng hồ.
 */
export const PATROL_SITE_BOUNDARY_RING: [number, number][] = CORRIDOR_MODEL.ring

/** Nội suy điểm trong hành lang: u = tây→đông dọc CT06, v = nam→bắc. */
export function patrolSitePoint(u: number, v: number): [number, number] {
  const uClamped = Math.max(0, Math.min(1, u))
  const vClamped = Math.max(0, Math.min(1, v))
  const south = pointAtArcU(CORRIDOR_MODEL.southTable, uClamped)
  const north = pointAtArcU(CORRIDOR_MODEL.northTable, uClamped)
  return enuToLatLng(
    south[0] + (north[0] - south[0]) * vClamped,
    south[1] + (north[1] - south[1]) * vClamped,
    CORRIDOR_MODEL.refLat,
    CORRIDOR_MODEL.refLng,
  )
}

/**
 * Polygon khu đầu capsule — K1/K7 gồm cả nửa hình tròn bo tròn A/B.
 * @param end 'west' = Khu 1, 'east' = Khu 7
 * @param uDivider u của đường chia khu (1/7 hoặc 6/7)
 */
export function buildPatrolCapInclusiveZonePolygon(
  end: 'west' | 'east',
  uDivider: number,
  edgeSamples = 16,
): [number, number][] {
  const cap = end === 'west' ? CORRIDOR_MODEL.westCapRing : CORRIDOR_MODEL.eastCapRing

  const divider: [number, number][] = []
  for (let i = 0; i <= edgeSamples; i += 1) {
    divider.push(patrolSitePoint(uDivider, i / edgeSamples))
  }

  const northRun: [number, number][] = []
  const southRun: [number, number][] = []

  if (end === 'west') {
    for (let i = 0; i <= edgeSamples; i += 1) {
      const u = uDivider * (1 - i / edgeSamples)
      northRun.push(patrolSitePoint(u, 1))
    }
    for (let i = 0; i <= edgeSamples; i += 1) {
      const u = (uDivider * i) / edgeSamples
      southRun.push(patrolSitePoint(u, 0))
    }
    const capWestToEast = [...cap].reverse()
    return [
      ...divider,
      ...northRun.slice(1),
      ...capWestToEast.slice(1),
      ...southRun.slice(1),
    ]
  }

  for (let i = 0; i <= edgeSamples; i += 1) {
    const u = uDivider + (1 - uDivider) * (i / edgeSamples)
    northRun.push(patrolSitePoint(u, 1))
  }
  for (let i = 0; i <= edgeSamples; i += 1) {
    const u = uDivider + (1 - uDivider) * (i / edgeSamples)
    southRun.push(patrolSitePoint(u, 0))
  }
  return [
    ...divider,
    ...northRun.slice(1),
    ...cap.slice(1),
    ...southRun.slice(1).reverse(),
  ]
}

/** Ranh giới công trường — polygon đỏ trên heatmap (đóng vòng). */
export const PATROL_SITE_BOUNDARY: [number, number][] = [
  ...PATROL_SITE_BOUNDARY_RING,
  PATROL_SITE_BOUNDARY_RING[0],
]

const SITE_RING = PATROL_SITE_BOUNDARY_RING

/** ~3.5% inset toward centroid — clip heatmap/detection không vượt viền đỏ. */
export const PATROL_SITE_CLIP_RING: [number, number][] = (() => {
  const cLat = SITE_RING.reduce((s, p) => s + p[0], 0) / SITE_RING.length
  const cLng = SITE_RING.reduce((s, p) => s + p[1], 0) / SITE_RING.length
  const inset = 0.035
  return SITE_RING.map(([lat, lng]) => [
    parseFloat((lat + (cLat - lat) * inset).toFixed(6)),
    parseFloat((lng + (cLng - lng) * inset).toFixed(6)),
  ])
})()

/** Inside = right of directed edge for this site ring winding. */
function isInsideEdge(p: LngLat, a: LngLat, b: LngLat): boolean {
  return cross2d(a[0], a[1], b[0], b[1], p[0], p[1]) <= 1e-12
}

function segmentIntersection(p1: LngLat, p2: LngLat, a: LngLat, b: LngLat): LngLat {
  const x1 = p1[0], y1 = p1[1], x2 = p2[0], y2 = p2[1]
  const x3 = a[0], y3 = a[1], x4 = b[0], y4 = b[1]
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
  if (Math.abs(denom) < 1e-14) return p1
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom
  return [x1 + t * (x2 - x1), y1 + t * (y2 - y1)]
}

function clipRingToEdge(subject: LngLat[], a: LngLat, b: LngLat): LngLat[] {
  if (subject.length === 0) return []
  const output: LngLat[] = []
  for (let i = 0; i < subject.length; i += 1) {
    const curr = subject[i]
    const prev = subject[(i + subject.length - 1) % subject.length]
    const currIn = isInsideEdge(curr, a, b)
    const prevIn = isInsideEdge(prev, a, b)
    if (currIn) {
      if (!prevIn) output.push(segmentIntersection(prev, curr, a, b))
      output.push(curr)
    } else if (prevIn) {
      output.push(segmentIntersection(prev, curr, a, b))
    }
  }
  return output
}

/** Clip a zone quad/polygon to the site boundary — density fill stays inside red line. */
export function clipPolygonToSiteBoundary(polygon: [number, number][]): [number, number][] {
  if (polygon.length < 3) return polygon

  const clipRing: LngLat[] = PATROL_SITE_CLIP_RING.map(([lat, lng]) => [lng, lat])
  let subject: LngLat[] = polygon.map(([lat, lng]) => [lng, lat])

  for (let i = 0; i < clipRing.length; i += 1) {
    const a = clipRing[i]
    const b = clipRing[(i + 1) % clipRing.length]
    subject = clipRingToEdge(subject, a, b)
    if (subject.length === 0) break
  }

  if (subject.length < 3) return polygon

  return subject.map(([lng, lat]) => [
    parseFloat(lat.toFixed(6)),
    parseFloat(lng.toFixed(6)),
  ])
}

/** Ray-casting point-in-polygon for the site boundary. */
export function isPointInSiteBoundary(lat: number, lng: number): boolean {
  return isInsideSiteRing(lat, lng, SITE_RING)
}

/** Pull point inside inset clip ring (không dính sát viền đỏ). */
export function clampPointToSiteInterior(lat: number, lng: number): [number, number] {
  if (isInsideSiteRing(lat, lng, PATROL_SITE_CLIP_RING)) {
    return [parseFloat(lat.toFixed(6)), parseFloat(lng.toFixed(6))]
  }
  const clamped = clampPointToSiteBoundary(lat, lng)
  const cLat = PATROL_SITE_CLIP_RING.reduce((s, p) => s + p[0], 0) / PATROL_SITE_CLIP_RING.length
  const cLng = PATROL_SITE_CLIP_RING.reduce((s, p) => s + p[1], 0) / PATROL_SITE_CLIP_RING.length
  for (let t = 0.08; t <= 1; t += 0.04) {
    const pLat = clamped[0] + (cLat - clamped[0]) * t
    const pLng = clamped[1] + (cLng - clamped[1]) * t
    if (isInsideSiteRing(pLat, pLng, PATROL_SITE_CLIP_RING)) {
      return [parseFloat(pLat.toFixed(6)), parseFloat(pLng.toFixed(6))]
    }
  }
  return [parseFloat(cLat.toFixed(6)), parseFloat(cLng.toFixed(6))]
}

/** Pull an out-of-bounds point toward site centroid until inside (fallback). */
export function clampPointToSiteBoundary(lat: number, lng: number): [number, number] {
  if (isPointInSiteBoundary(lat, lng)) {
    return [parseFloat(lat.toFixed(6)), parseFloat(lng.toFixed(6))]
  }
  const cLat = SITE_RING.reduce((s, p) => s + p[0], 0) / SITE_RING.length
  const cLng = SITE_RING.reduce((s, p) => s + p[1], 0) / SITE_RING.length
  for (let t = 0.05; t <= 1; t += 0.05) {
    const pLat = lat + (cLat - lat) * t
    const pLng = lng + (cLng - lng) * t
    if (isPointInSiteBoundary(pLat, pLng)) {
      return [parseFloat(pLat.toFixed(6)), parseFloat(pLng.toFixed(6))]
    }
  }
  return [parseFloat(cLat.toFixed(6)), parseFloat(cLng.toFixed(6))]
}

/** Legacy export — stadium builder retained for tests referencing arc math. */
export function buildStadiumCapsuleRing(
  westCenter: [number, number],
  eastCenter: [number, number],
  envelopePoints: [number, number][],
  arcSteps = 28,
): [number, number][] {
  const refLat = (westCenter[0] + eastCenter[0]) / 2
  const refLng = (westCenter[1] + eastCenter[1]) / 2
  const tipAEnu = latLngToEnu(PATROL_SITE_TIP_A[0], PATROL_SITE_TIP_A[1], refLat, refLng)
  const pinchSEnu = latLngToEnu(PATROL_SITE_PINCH_SOUTH[0], PATROL_SITE_PINCH_SOUTH[1], refLat, refLng)
  const pinchNEnu = latLngToEnu(PATROL_SITE_PINCH_NORTH[0], PATROL_SITE_PINCH_NORTH[1], refLat, refLng)
  void envelopePoints
  void arcSteps
  void westCenter
  void eastCenter
  const midPinch = lerpPt(pinchSEnu, pinchNEnu, 0.5)
  const inwardA = normalizePt(subPt(midPinch, tipAEnu))
  const perpA = perpPt(inwardA)
  const radiusA = Math.max(400, dotPt(subPt(pinchSEnu, tipAEnu), inwardA) * CAP_RADIUS_SCALE_WEST)
  const centerA = addPt(tipAEnu, scalePt(inwardA, radiusA))
  const westSouth = addPt(centerA, scalePt(perpA, radiusA))
  const westNorth = addPt(centerA, scalePt(perpA, -radiusA))
  return [
    enuToLatLng(westSouth[0], westSouth[1], refLat, refLng),
    enuToLatLng(westNorth[0], westNorth[1], refLat, refLng),
  ]
}
