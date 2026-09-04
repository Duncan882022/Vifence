import { PATROL_GPS_ZONES } from '../data/patrolSiteMap'
import type { PatrolDayPresence, PatrolDayStats } from '../services/patrolDayEvents.service'

export interface PatrolHeatmapStatsRow {
  objectCount: number
  personCount: number
  identityCount: number
}

function isPointInZonePolygon(lat: number, lng: number, polygon: [number, number][]): boolean {
  if (polygon.length < 3) return false
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i]
    const [yj, xj] = polygon[j]
    const intersects = (yi > lat) !== (yj > lat)
      && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

function resolvePresenceGps(presence: PatrolDayPresence): { lat: number | null; lng: number | null } {
  const endLat = presence.gpsLatEnd
  const endLng = presence.gpsLngEnd
  if (endLat != null && endLng != null && Number.isFinite(endLat) && Number.isFinite(endLng)) {
    return { lat: endLat, lng: endLng }
  }
  return { lat: presence.gpsLat, lng: presence.gpsLng }
}

/** Gán presence vào ZONE_SITE — ưu tiên zoneId backend, fallback GPS trong polygon. */
export function resolvePatrolPresenceZoneId(presence: PatrolDayPresence): string | null {
  const zoneIds = new Set(PATROL_GPS_ZONES.map(z => z.zone_id))
  if (presence.zoneId && zoneIds.has(presence.zoneId)) {
    return presence.zoneId
  }

  const { lat, lng } = resolvePresenceGps(presence)
  if (lat == null || lng == null) return null

  for (const zone of PATROL_GPS_ZONES) {
    if (isPointInZonePolygon(lat, lng, zone.polygon)) {
      return zone.zone_id
    }
  }
  return null
}

/** Thống kê 3 tầng cho một khu hoặc toàn dự án (zoneId = null). */
export function buildPatrolHeatmapStatsForZone(
  presences: PatrolDayPresence[],
  zoneId: string | null,
): PatrolHeatmapStatsRow {
  const scoped = zoneId == null
    ? presences
    : presences.filter(p => resolvePatrolPresenceZoneId(p) === zoneId)

  let objectCount = 0
  const personIds = new Set<string>()
  const identityIds = new Set<string>()

  for (const presence of scoped) {
    if (presence.tier === 'object') {
      objectCount += 1
    } else if (presence.tier === 'identity') {
      identityIds.add(presence.subjectId)
    } else {
      personIds.add(presence.subjectId)
    }
  }

  return {
    objectCount,
    personCount: personIds.size,
    identityCount: identityIds.size,
  }
}

/** Site-wide — đồng bộ overlay heatmap với KPI ngày. */
export function buildPatrolSiteHeatmapStats(dayStats: PatrolDayStats): PatrolHeatmapStatsRow {
  return {
    objectCount: dayStats.unassignedObservations,
    personCount: dayStats.personCount,
    identityCount: dayStats.identityCount,
  }
}
