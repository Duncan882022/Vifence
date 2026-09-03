/**
 * Site boundary geometry — shared by zones, detection, density clip rules.
 * Coordinate system: [lat, lng] (Leaflet convention).
 *
 * Dự án Cầu Sông Hốt — capsule 2 đầu tròn (khảo sát CT06 Quảng Yên).
 * Ghim tham chiếu zone 3: 20°55'42.4"N 106°52'25.0"E.
 */

const M_PER_DEG_LAT = 111_320

/** Ghim khảo sát Bùi Xá — nằm trong ZONE_3. */
export const PATROL_SURVEY_PIN: [number, number] = [20.928444, 106.873611]

/** 4 góc điều khiển bilinear (TL→TR→BR→BL) — căn viền đỏ + neo ghim Bùi Xá vào ZONE_3. */
export const PATROL_SITE_CORNERS: [number, number][] = [
  [20.9462, 106.8395],
  [20.9445, 106.9375],
  [20.9165, 106.9365],
  [20.9180, 106.8385],
]

const SITE_TOP = PATROL_SITE_CORNERS[0]
const SITE_RIGHT = PATROL_SITE_CORNERS[1]
const SITE_BOTTOM = PATROL_SITE_CORNERS[2]
const SITE_LEFT = PATROL_SITE_CORNERS[3]

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

type LngLat = [number, number] // [lng, lat]

function cross2d(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
}

function isInsideSiteRing(lat: number, lng: number, ring: [number, number][]): boolean {
  const p: LngLat = [lng, lat]
  const clipRing: LngLat[] = ring.map(([la, ln]) => [ln, la])
  for (let i = 0; i < clipRing.length; i += 1) {
    const a = clipRing[i]
    const b = clipRing[(i + 1) % clipRing.length]
    if (cross2d(a[0], a[1], b[0], b[1], p[0], p[1]) > 1e-11) return false
  }
  return true
}

/**
 * Stadium / capsule — 2 nửa hình tròn ở 2 đầu + 2 cạnh thẳng song song.
 * Trục dọc CT06 (tây → đông); bán kính = max khoảng cách vuông góc tới trục.
 */
export function buildStadiumCapsuleRing(
  westCenter: [number, number],
  eastCenter: [number, number],
  envelopePoints: [number, number][],
  arcSteps = 28,
): [number, number][] {
  const refLat = (westCenter[0] + eastCenter[0]) / 2
  const refLng = (westCenter[1] + eastCenter[1]) / 2

  const [wx, wy] = latLngToEnu(westCenter[0], westCenter[1], refLat, refLng)
  const [ex, ey] = latLngToEnu(eastCenter[0], eastCenter[1], refLat, refLng)

  const axisLen = Math.hypot(ex - wx, ey - wy)
  if (axisLen < 50) {
    return envelopePoints.length >= 4
      ? [...envelopePoints]
      : [westCenter, eastCenter, westCenter]
  }

  const ux = (ex - wx) / axisLen
  const uy = (ey - wy) / axisLen
  const px = -uy
  const py = ux

  let r = 0
  for (const [lat, lng] of envelopePoints) {
    const [x, y] = latLngToEnu(lat, lng, refLat, refLng)
    const perp = Math.abs((x - wx) * px + (y - wy) * py)
    if (perp > r) r = perp
  }
  if (r < 80) r = 800

  const wcx = wx + ux * r
  const wcy = wy + uy * r
  const ecx = ex - ux * r
  const ecy = ey - uy * r

  const ringEnu: [number, number][] = []
  const straightSteps = Math.max(10, Math.round(axisLen / 350))

  for (let i = 0; i <= straightSteps; i += 1) {
    const t = i / straightSteps
    ringEnu.push([
      wcx + (ecx - wcx) * t + px * r,
      wcy + (ecy - wcy) * t + py * r,
    ])
  }

  for (let i = 1; i <= arcSteps; i += 1) {
    const angle = (Math.PI * i) / arcSteps
    ringEnu.push([
      ecx + r * Math.cos(angle) * px + r * Math.sin(angle) * ux,
      ecy + r * Math.cos(angle) * py + r * Math.sin(angle) * uy,
    ])
  }

  for (let i = straightSteps - 1; i >= 0; i -= 1) {
    const t = i / straightSteps
    ringEnu.push([
      wcx + (ecx - wcx) * t - px * r,
      wcy + (ecy - wcy) * t - py * r,
    ])
  }

  for (let i = 1; i <= arcSteps - 1; i += 1) {
    const angle = Math.PI + (Math.PI * i) / arcSteps
    ringEnu.push([
      wcx + r * Math.cos(angle) * px + r * Math.sin(angle) * ux,
      wcy + r * Math.cos(angle) * py + r * Math.sin(angle) * uy,
    ])
  }

  let ring = ringEnu.map(([e, n]) => enuToLatLng(e, n, refLat, refLng))
  const probe = envelopePoints[envelopePoints.length - 1] ?? westCenter
  if (!isInsideSiteRing(probe[0], probe[1], ring)) {
    ring = [...ring].reverse()
  }
  return ring
}

const CAPSULE_ENVELOPE: [number, number][] = [
  ...PATROL_SITE_CORNERS,
  sitePoint(0, 0),
  sitePoint(0, 1),
  sitePoint(1, 0),
  sitePoint(1, 1),
  sitePoint(0.5, 0),
  sitePoint(0.5, 1),
  PATROL_SURVEY_PIN,
]

/**
 * Viền đỏ heatmap — capsule bầu 2 đầu (~56 đỉnh), ngược chiều kim đồng hồ.
 */
export const PATROL_SITE_BOUNDARY_RING: [number, number][] = buildStadiumCapsuleRing(
  sitePoint(0, 0.5),
  sitePoint(1, 0.5),
  CAPSULE_ENVELOPE,
)

/** Export sitePoint for zone dividers / device anchors. */
export function patrolSitePoint(u: number, v: number): [number, number] {
  return sitePoint(u, v)
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
