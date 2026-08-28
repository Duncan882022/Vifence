/**
 * GPS mặc định trang Phát sóng — neo Cầu Sông Hốt khi chưa có fix.
 */
import { PATROL_SITE_CENTER } from '../data/patrolSiteMap'

export interface HelmetGpsState {
  lat: number
  lng: number
  accuracyM: number
  updatedAt: number
  /** Chưa có fix thật — đang dùng tâm Cầu Sông Hốt. */
  isDefault?: boolean
}

export function createDefaultPublisherGps(now = Date.now()): HelmetGpsState {
  return {
    lat: PATROL_SITE_CENTER[0],
    lng: PATROL_SITE_CENTER[1],
    accuracyM: 0,
    updatedAt: now,
    isDefault: true,
  }
}

export function formatPublisherGpsLabel(gps: HelmetGpsState): string {
  const coords = `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}`
  return gps.isDefault ? `${coords} · mặc định` : coords
}
