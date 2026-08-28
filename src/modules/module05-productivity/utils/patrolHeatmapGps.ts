/**
 * GPS cho heatmap patrol — không có GPS thật → Cầu Sông Hốt (PATROL_SITE_CENTER).
 */
import {
  getPatrolHelmetGps,
  getPatrolHelmetGpsLastKnown,
} from '@/services/patrolHelmetGpsBridge'
import { isPatrolHelmetCameraId } from '../data/patrolHelmetScope'
import {
  PATROL_MAP_ACTIVE_DRONE_PINS,
  PATROL_MAP_ACTIVE_HELMET_PINS,
  PATROL_HELMET_01_FALLBACK,
  PATROL_HELMET_02_FALLBACK,
  PATROL_SITE_CENTER,
} from '../data/patrolSiteMap'
import { clampPointToSiteInterior } from '../data/patrolSiteGeometry'
import { haversineM } from './patrolDetectionMapOffset'
import { offsetLatLngByMeters } from './patrolLivePersonDots'

/** Khoảng cách tối thiểu giữa icon mũ trên bản đồ (m). */
export const PATROL_HELMET_MIN_DISPLAY_SEPARATION_M = 55

const PATROL_HELMET_FALLBACKS: Record<string, [number, number]> = {
  'HC-01': PATROL_HELMET_01_FALLBACK,
  'HC-02': PATROL_HELMET_02_FALLBACK,
}

/** GPS gần nhau / cùng neo → tách icon HC-02 về phía neo đông-bắc. */
export function enforcePatrolHelmetPinSeparation(
  positions: Record<string, [number, number]>,
  minM = PATROL_HELMET_MIN_DISPLAY_SEPARATION_M,
): Record<string, [number, number]> {
  const hc01 = positions['HC-01']
  const hc02 = positions['HC-02']
  if (!hc01 || !hc02) return positions
  if (haversineM(hc01[0], hc01[1], hc02[0], hc02[1]) >= minM) return positions

  const target = PATROL_HELMET_FALLBACKS['HC-02']
  const cosLat = Math.cos((hc01[0] * Math.PI) / 180)
  const northM = (target[0] - hc01[0]) * 111_320
  const eastM = (target[1] - hc01[1]) * 111_320 * Math.max(cosLat, 0.2)
  const len = Math.hypot(eastM, northM)
  const scale = len >= 1 ? minM / len : 0
  const east = len >= 1 ? eastM * scale : minM
  const north = len >= 1 ? northM * scale : 0
  const [lat, lng] = offsetLatLngByMeters(hc01[0], hc01[1], east, north)
  const [clat, clng] = clampPointToSiteInterior(lat, lng)
  return { ...positions, 'HC-02': [clat, clng] }
}

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
    const [clat, clng] = clampPointToSiteInterior(lat, lng)
    return [clat, clng]
  }
  return fallback
}

/** Luôn trả tọa độ — không GPS → tâm Cầu Sông Hốt. */
export function resolvePatrolHeatmapGps(cameraId: string): { lat: number; lng: number } {
  if (isPatrolHelmetCameraId(cameraId)) {
    const snap = getPatrolHelmetGps(cameraId) ?? getPatrolHelmetGpsLastKnown(cameraId)
    if (snap && isValidGps(snap.lat, snap.lng)) {
      return { lat: snap.lat, lng: snap.lng }
    }
    return { lat: PATROL_SITE_CENTER[0], lng: PATROL_SITE_CENTER[1] }
  }

  const pin = PATROL_MAP_ACTIVE_HELMET_PINS.find(p => p.id === cameraId)
    ?? PATROL_MAP_ACTIVE_DRONE_PINS.find(p => p.id === cameraId)
  if (pin) return { lat: pin.position[0], lng: pin.position[1] }
  return { lat: PATROL_SITE_CENTER[0], lng: PATROL_SITE_CENTER[1] }
}

export function resolvePatrolHeatmapGpsOrNull(cameraId: string): { lat: number; lng: number } | null {
  const gps = resolvePatrolHeatmapGps(cameraId)
  return gps
}
