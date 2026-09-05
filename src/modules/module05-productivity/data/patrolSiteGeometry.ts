/**
 * Site boundary geometry — shared by zones, detection, density clip rules.
 * Coordinate system: [lat, lng] (Leaflet convention).
 *
 * Dự án Cầu Sông Hốt — hai khu vực khảo sát (đỏ + xanh).
 */

const M_PER_DEG_LAT = 111_320

/** Đỉnh nam-đông K1 — nối sát cạnh K2 (đỉnh 4). */
export const PATROL_ZONE_K1_SOUTH_EAST: [number, number] = [20.951242, 106.931298]

/** Khu vực 1 — đỏ (lat, lng). */
export const PATROL_ZONE_1_QUAD: [number, number][] = [
  [20.956611, 106.924918],
  [20.956808, 106.931088],
  PATROL_ZONE_K1_SOUTH_EAST,
  [20.950849, 106.924707],
]

/**
 * Khu vực 2 — xanh (lat, lng).
 * Pentagon: cạnh 3→4 nối đỉnh SW khảo sát vào điểm chung K1;
 * cạnh 4→0 là ranh giới chia hai khu.
 */
export const PATROL_ZONE_2_QUAD: [number, number][] = [
  [20.956808, 106.931088],
  [20.958527, 106.939064],
  [20.952224, 106.939801],
  [20.950538, 106.932420],
  PATROL_ZONE_K1_SOUTH_EAST,
]

/** Quad nội suy K2 (bỏ đỉnh 3 — chỉ dùng trail / patrolSitePoint). */
export const PATROL_ZONE_2_BILINEAR_QUAD: [number, number][] = [
  PATROL_ZONE_2_QUAD[0],
  PATROL_ZONE_2_QUAD[1],
  PATROL_ZONE_2_QUAD[2],
  PATROL_ZONE_2_QUAD[4],
]

/** Viền ngoài gộp hai khu — clip detection / trail. */
export const PATROL_SITE_BOUNDARY_RING: [number, number][] = [
  PATROL_ZONE_1_QUAD[0],
  PATROL_ZONE_1_QUAD[1],
  PATROL_ZONE_2_QUAD[1],
  PATROL_ZONE_2_QUAD[2],
  PATROL_ZONE_2_QUAD[3],
  PATROL_ZONE_K1_SOUTH_EAST,
  PATROL_ZONE_1_QUAD[3],
]

/** @deprecated Dùng PATROL_ZONE_1_QUAD / PATROL_ZONE_2_QUAD. */
export const PATROL_SITE_QUAD: [number, number][] = PATROL_SITE_BOUNDARY_RING

function polygonCentroid(polygon: readonly [number, number][]): [number, number] {
  const lat = polygon.reduce((s, p) => s + p[0], 0) / polygon.length
  const lng = polygon.reduce((s, p) => s + p[1], 0) / polygon.length
  return [parseFloat(lat.toFixed(6)), parseFloat(lng.toFixed(6))]
}

/** Tâm toàn công trường — trung bình hai khu. */
export const PATROL_SURVEY_PIN: [number, number] = polygonCentroid([
  ...PATROL_ZONE_1_QUAD,
  ...PATROL_ZONE_2_QUAD.slice(1),
])

/** Legacy corridor anchors — giữ export để test/stub cũ không gãy import. */
export const PATROL_SITE_TIP_A: [number, number] = PATROL_ZONE_1_QUAD[0]
export const PATROL_SITE_TIP_B: [number, number] = PATROL_ZONE_2_QUAD[1]
export const PATROL_SITE_PINCH_SOUTH: [number, number] = PATROL_ZONE_1_QUAD[3]
export const PATROL_SITE_PINCH_NORTH: [number, number] = PATROL_ZONE_2_QUAD[1]
export const PATROL_SURVEY_SOUTH_BEND: [number, number] = [
  parseFloat((PATROL_SURVEY_PIN[0] - 0.0004).toFixed(6)),
  PATROL_SURVEY_PIN[1],
]

/** Bbox hai khu — zoom / fallback. */
export const PATROL_SITE_CORNERS: [number, number][] = (() => {
  const all = [...PATROL_ZONE_1_QUAD, ...PATROL_ZONE_2_QUAD]
  const lats = all.map(p => p[0])
  const lngs = all.map(p => p[1])
  const minLat = Math.min(...lats)
  const maxLat = Math.max(...lats)
  const minLng = Math.min(...lngs)
  const maxLng = Math.max(...lngs)
  return [
    [maxLat, minLng],
    [maxLat, maxLng],
    [minLat, maxLng],
    [minLat, minLng],
  ]
})()

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

function bilinearInQuad(
  quad: readonly [number, number][],
  u: number,
  v: number,
): [number, number] {
  const [p00, p10, p11, p01] = quad
  const lat =
    (1 - u) * (1 - v) * p00[0]
    + u * (1 - v) * p10[0]
    + u * v * p11[0]
    + (1 - u) * v * p01[0]
  const lng =
    (1 - u) * (1 - v) * p00[1]
    + u * (1 - v) * p10[1]
    + u * v * p11[1]
    + (1 - u) * v * p01[1]
  return [parseFloat(lat.toFixed(6)), parseFloat(lng.toFixed(6))]
}

/** Nội suy trong khu: u∈[0,½] → K1, u∈(½,1] → K2; v = nam→bắc. */
export function patrolSitePoint(u: number, v: number): [number, number] {
  const uClamped = Math.max(0, Math.min(1, u))
  const vClamped = Math.max(0, Math.min(1, v))
  if (uClamped <= 0.5) {
    return bilinearInQuad(PATROL_ZONE_1_QUAD, uClamped * 2, vClamped)
  }
  return bilinearInQuad(PATROL_ZONE_2_BILINEAR_QUAD, (uClamped - 0.5) * 2, vClamped)
}

/**
 * Polygon khu — west = K1, east = K2.
 */
export function buildPatrolCapInclusiveZonePolygon(
  end: 'west' | 'east',
  _uDivider: number,
  _edgeSamples = 16,
): [number, number][] {
  return end === 'west' ? [...PATROL_ZONE_1_QUAD] : [...PATROL_ZONE_2_QUAD]
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
  return isInsideSiteRing(lat, lng, PATROL_ZONE_1_QUAD)
    || isInsideSiteRing(lat, lng, PATROL_ZONE_2_QUAD)
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
