import type { PatrolDayPresence } from '../services/patrolDayEvents.service'
import { PATROL_SITE_CENTER } from '../data/patrolSiteMap'

/** GPS gần nhất theo subject_id từ presences bundle. */
export function buildPatrolSubjectGpsLookup(
  presences: PatrolDayPresence[],
): Map<string, { lat: number; lng: number }> {
  const scratch = new Map<string, { lat: number; lng: number; sortKey: number }>()

  for (const presence of presences) {
    const subjectId = presence.subjectId.trim()
    if (!subjectId) continue
    const lat = presence.gpsLatEnd ?? presence.gpsLat
    const lng = presence.gpsLngEnd ?? presence.gpsLng
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) continue
    if (lat === 0 && lng === 0) continue
    const sortKey = presence.endedAt * 10 + presence.presenceSeq
    const prev = scratch.get(subjectId)
    if (!prev || sortKey >= prev.sortKey) {
      scratch.set(subjectId, { lat, lng, sortKey })
    }
  }

  const out = new Map<string, { lat: number; lng: number }>()
  for (const [subjectId, { lat, lng }] of scratch) {
    out.set(subjectId, { lat, lng })
  }
  return out
}

export function resolvePatrolEventGps(
  subjectId: string,
  bundleGps: { lat?: number | null; lng?: number | null } | undefined,
  presenceLookup: Map<string, { lat: number; lng: number }>,
): { lat: number; lng: number } {
  const fromBundle = bundleGps?.lat != null && bundleGps?.lng != null
    && Number.isFinite(bundleGps.lat) && Number.isFinite(bundleGps.lng)
    && !(bundleGps.lat === 0 && bundleGps.lng === 0)
  if (fromBundle) {
    return { lat: bundleGps.lat!, lng: bundleGps.lng! }
  }
  const fromPresence = presenceLookup.get(subjectId.trim())
  if (fromPresence) return fromPresence
  return { lat: PATROL_SITE_CENTER[0], lng: PATROL_SITE_CENTER[1] }
}
