/**
 * Site boundary geometry — shared by zones, detection, density clip rules.
 * Coordinate system: [lat, lng] (Leaflet convention).
 *
 * Cầu Sông Hốt — một zone duy nhất, viền heatmap theo 4 điểm GPS khảo sát.
 */

const M_PER_DEG_LAT = 111_320

/** 4 điểm neo GPS — viền đỏ heatmap (theo thứ tự người dùng cung cấp). */
export const PATROL_SITE_BOUNDARY_RING: [number, number][] = [
  [20.955148, 106.924572],
  [20.957172, 106.934593],
  [20.953906, 106.93528],
  [20.952243, 106.925838],
]

/** Legacy aliases — góc polygon (giữ export cho code cũ). */
export const PATROL_SITE_TIP_A: [number, number] = PATROL_SITE_BOUNDARY_RING[0]
export const PATROL_SITE_TIP_B: [number, number] = PATROL_SITE_BOUNDARY_RING[1]
export const PATROL_SITE_PINCH_SOUTH: [number, number] = PATROL_SITE_BOUNDARY_RING[3]
export const PATROL_SITE_PINCH_NORTH: [number, number] = PATROL_SITE_BOUNDARY_RING[0]

function polygonCentroid(polygon: [number, number][]): [number, number] {
  if (polygon.length === 0) return [20.954617, 106.930071]
  const lat = polygon.reduce((s, p) => s + p[0], 0) / polygon.length
  const lng = polygon.reduce((s, p) => s + p[1], 0) / polygon.length
  return [parseFloat(lat.toFixed(6)), parseFloat(lng.toFixed(6))]
}

/** Tâm zone / neo GPS mặc định. */
export const PATROL_SITE_CENTER: [number, number] = polygonCentroid(PATROL_SITE_BOUNDARY_RING)

/** Ghim khảo sát — trùng tâm polygon. */
export const PATROL_SURVEY_PIN: [number, number] = [...PATROL_SITE_CENTER]

export const PATROL_SURVEY_SOUTH_BEND: [number, number] = [
  parseFloat((PATROL_SURVEY_PIN[0] - 0.0004).toFixed(6)),
  PATROL_SURVEY_PIN[1],
]

/** Bbox legacy — zoom / fallback. */
export const PATROL_SITE_CORNERS: [number, number][] = [
  [
    Math.max(...PATROL_SITE_BOUNDARY_RING.map(p => p[0])),
    Math.min(...PATROL_SITE_BOUNDARY_RING.map(p => p[1])),
  ],
  [
    Math.max(...PATROL_SITE_BOUNDARY_RING.map(p => p[0])),
    Math.max(...PATROL_SITE_BOUNDARY_RING.map(p => p[1])),
  ],
  [
    Math.min(...PATROL_SITE_BOUNDARY_RING.map(p => p[0])),
    Math.max(...PATROL_SITE_BOUNDARY_RING.map(p => p[1])),
  ],
  [
    Math.min(...PATROL_SITE_BOUNDARY_RING.map(p => p[0])),
    Math.min(...PATROL_SITE_BOUNDARY_RING.map(p => p[1])),
  ],
]

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

function polygonAreaSqm(polygon: [number, number][]): number {
  if (polygon.length < 3) return 0
  const refLat = polygon.reduce((s, p) => s + p[0], 0) / polygon.length
  const refLng = polygon.reduce((s, p) => s + p[1], 0) / polygon.length
  const enu = polygon.map(([lat, lng]) => latLngToEnu(lat, lng, refLat, refLng))
  let area = 0
  for (let i = 0; i < enu.length; i += 1) {
    const [x1, y1] = enu[i]
    const [x2, y2] = enu[(i + 1) % enu.length]
    area += x1 * y2 - x2 * y1
  }
  return Math.abs(area) / 2
}

export const PATROL_SITE_AREA_M2 = Math.round(polygonAreaSqm(PATROL_SITE_BOUNDARY_RING))

/** Nội suy điểm trong quad: u = tây→đông, v = nam→bắc. */
export function patrolSitePoint(u: number, v: number): [number, number] {
  const uClamped = Math.max(0, Math.min(1, u))
  const vClamped = Math.max(0, Math.min(1, v))
  const [nw, ne, se, sw] = PATROL_SITE_BOUNDARY_RING
  const southLat = sw[0] + (se[0] - sw[0]) * uClamped
  const southLng = sw[1] + (se[1] - sw[1]) * uClamped
  const northLat = nw[0] + (ne[0] - nw[0]) * uClamped
  const northLng = nw[1] + (ne[1] - nw[1]) * uClamped
  return [
    parseFloat((southLat + (northLat - southLat) * vClamped).toFixed(6)),
    parseFloat((southLng + (northLng - southLng) * vClamped).toFixed(6)),
  ]
}

/** @deprecated Một zone duy nhất — trả về toàn bộ viền site. */
export function buildPatrolCapInclusiveZonePolygon(
  _end: 'west' | 'east',
  _uDivider: number,
): [number, number][] {
  return [...PATROL_SITE_BOUNDARY_RING]
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

type LngLat = [number, number]

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

function cross2d(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
}

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

export function isPointInSiteBoundary(lat: number, lng: number): boolean {
  return isInsideSiteRing(lat, lng, SITE_RING)
}

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

/** Legacy export — giữ cho test cũ. */
export function buildStadiumCapsuleRing(
  _westCenter: [number, number],
  _eastCenter: [number, number],
  _envelopePoints: [number, number][],
): [number, number][] {
  return [...PATROL_SITE_BOUNDARY_RING]
}
