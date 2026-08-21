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

/** Ray-casting point-in-polygon for the site quad. */
export function isPointInSiteBoundary(lat: number, lng: number): boolean {
  let inside = false
  for (let i = 0, j = SITE_RING.length - 1; i < SITE_RING.length; j = i++) {
    const [yi, xi] = SITE_RING[i]
    const [yj, xj] = SITE_RING[j]
    const intersects =
      (yi > lat) !== (yj > lat) &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
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
