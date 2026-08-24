/**
 * Site boundary geometry — shared by zones, detection, density clip rules.
 * Coordinate system: [lat, lng] (Leaflet convention).
 *
 * Công trường Cầu Sông Hốt — center 20.933094, 106.923950
 */

/** 4 góc ROI công trường (user survey) — đóng vòng tại điểm đầu. */
export const PATROL_SITE_CORNERS: [number, number][] = [
  [20.934409, 106.925451],
  [20.932911, 106.926792],
  [20.931753, 106.921778],
  [20.933707, 106.921705],
]

/** Ranh giới công trường — polygon đỏ trên heatmap. */
export const PATROL_SITE_BOUNDARY: [number, number][] = [
  ...PATROL_SITE_CORNERS,
  PATROL_SITE_CORNERS[0],
]

const SITE_RING = PATROL_SITE_CORNERS

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

type LngLat = [number, number] // [lng, lat]

function cross2d(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
}

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

/** Same half-plane test as clip — consistent with zone/density bounds. */
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

/** Ray-casting point-in-polygon for the site quad. */
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
