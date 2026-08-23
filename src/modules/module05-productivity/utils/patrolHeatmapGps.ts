/**
 * GPS cho heatmap patrol — không có GPS thật → Cầu Sông Hốt (PATROL_SITE_CENTER).
 */
import {
  getPatrolHelmetGps,
  getPatrolHelmetGpsLastKnown,
} from '@/services/patrolHelmetGpsBridge'
import { isPatrolHelmetCameraId } from '../data/patrolHelmetScope'
import {
  PATROL_MAP_ACTIVE_HELMET_PINS,
  PATROL_SITE_CENTER,
} from '../data/patrolSiteMap'

function isValidGps(lat: number, lng: number): boolean {
  return Number.isFinite(lat)
    && Number.isFinite(lng)
    && !(lat === 0 && lng === 0)
}

/** Có GPS hợp lệ → dùng thật; không có → fallback (mặc định cạnh HC-01). */
export function resolvePatrolHelmetMapPosition(
  lat: number | null | undefined,
  lng: number | null | undefined,
  fallback: [number, number] = PATROL_SITE_CENTER,
): [number, number] {
  if (lat != null && lng != null && isValidGps(lat, lng)) {
    return [parseFloat(lat.toFixed(6)), parseFloat(lng.toFixed(6))]
  }
  return fallback
}

/** Luôn trả tọa độ — HC-* không GPS → neo công trường Cầu Sông Hốt. */
export function resolvePatrolHeatmapGps(cameraId: string): { lat: number; lng: number } {
  if (isPatrolHelmetCameraId(cameraId)) {
    const snap = getPatrolHelmetGps(cameraId) ?? getPatrolHelmetGpsLastKnown(cameraId)
    if (snap && isValidGps(snap.lat, snap.lng)) {
      return { lat: snap.lat, lng: snap.lng }
    }
    return { lat: PATROL_SITE_CENTER[0], lng: PATROL_SITE_CENTER[1] }
  }

  const pin = PATROL_MAP_ACTIVE_HELMET_PINS.find(p => p.id === cameraId)
  if (pin) return { lat: pin.position[0], lng: pin.position[1] }
  return { lat: PATROL_SITE_CENTER[0], lng: PATROL_SITE_CENTER[1] }
}

export function resolvePatrolHeatmapGpsOrNull(cameraId: string): { lat: number; lng: number } | null {
  const gps = resolvePatrolHeatmapGps(cameraId)
  return gps
}
