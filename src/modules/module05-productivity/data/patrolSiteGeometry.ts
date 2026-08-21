/**
 * Site boundary geometry — shared by zones, detection, density clip rules.
 * Coordinate system: [lat, lng] (Leaflet convention).
 */

/** Ranh giới công trường — 4 góc thực đo (TOP → RIGHT → BOTTOM → LEFT → close). */
export const PATROL_SITE_BOUNDARY: [number, number][] = [
  [21.004587, 105.947314],
  [21.003598, 105.948614],
  [21.002343, 105.946914],
  [21.003712, 105.945782],
  [21.004587, 105.947314],
]

const SITE_RING = PATROL_SITE_BOUNDARY.slice(0, 4)

/** ~3.5% inset toward centroid — fill không chạm/vượt viền đỏ khi render anti-alias. */
const SITE_CLIP_RING: [number, number][] = (() => {
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

  const clipRing: LngLat[] = SITE_CLIP_RING.map(([lat, lng]) => [lng, lat])
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
