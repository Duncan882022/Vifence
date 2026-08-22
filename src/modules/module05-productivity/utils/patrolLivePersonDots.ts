import type { DetectionDot } from '../data/patrolDetectionData'

const METERS_PER_DEG_LAT = 111_320
const MAX_DOTS = 12
const DEFAULT_RADIUS_M = 1

/** Offset mét (đông / bắc) → lat/lng quanh điểm GPS. */
export function offsetLatLngByMeters(
  lat: number,
  lng: number,
  eastM: number,
  northM: number,
): [number, number] {
  const dLat = northM / METERS_PER_DEG_LAT
  const cosLat = Math.cos((lat * Math.PI) / 180)
  const dLng = eastM / (METERS_PER_DEG_LAT * Math.max(cosLat, 0.2))
  return [lat + dLat, lng + dLng]
}

/**
 * Nội suy chấm người quanh GPS camera trong bán kính ≤ radiusM (mặc định 1m).
 * Góc đều theo index — ổn định khi personCount đổi nhẹ.
 */
export function buildPersonDotsAroundGps(
  cameraId: string,
  lat: number,
  lng: number,
  personCount: number,
  radiusM = DEFAULT_RADIUS_M,
): DetectionDot[] {
  const n = Math.min(Math.max(0, Math.floor(personCount)), MAX_DOTS)
  if (n <= 0 || !Number.isFinite(lat) || !Number.isFinite(lng)) return []

  const dots: DetectionDot[] = []
  for (let i = 0; i < n; i++) {
    const angle = (2 * Math.PI * i) / n + (n === 1 ? Math.PI / 5 : 0)
    const r = n === 1
      ? radiusM * 0.55
      : radiusM * (0.4 + ((i % 3) * 0.2))
    const [plat, plng] = offsetLatLngByMeters(
      lat,
      lng,
      Math.cos(angle) * r,
      Math.sin(angle) * r,
    )
    dots.push({
      id: `live-${cameraId}-person-${i}`,
      type: 'person',
      position: [plat, plng],
      zoneId: 'LIVE',
      cameraId,
      confidence: 0.92,
    })
  }
  return dots
}
