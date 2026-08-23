/**
 * Đồng bộ person detect live (HC-01 VMS / HC-02 mobile) → dot trên heatmap.
 */
import type { MobileAiDetection } from '@/modules/module02-training/services/mobileAiBackend.service'
import {
  getPatrolHelmetGps,
  getPatrolHelmetGpsLastKnown,
} from '@/services/patrolHelmetGpsBridge'
import { upsertHeatmapPersons } from '@/services/patrolHeatmapPersonRegistry'
import { getPatrolMobileLiveSnapshot } from '@/services/patrolMobileMetricsBridge'
import { isPatrolHelmetCameraId } from '../data/patrolHelmetScope'
import {
  PATROL_HELMET_ZONE_ASSIGNMENTS,
  PATROL_MAP_ACTIVE_HELMET_PINS,
  PATROL_SITE_CENTER,
} from '../data/patrolSiteMap'
import { matchPersonTracks, type PersonTrack } from './patrolHeatmapPersonTracker'
import { mapMatchPosition } from './positionEngine'

const tracksByCamera = new Map<string, Map<string, PersonTrack>>()

function isValidGps(lat: number, lng: number): boolean {
  return Number.isFinite(lat)
    && Number.isFinite(lng)
    && !(lat === 0 && lng === 0)
}

export function resolvePatrolHeatmapGps(cameraId: string): { lat: number; lng: number } | null {
  if (cameraId === 'HC-02') {
    const snap = getPatrolHelmetGps(cameraId) ?? getPatrolHelmetGpsLastKnown(cameraId)
    if (snap && isValidGps(snap.lat, snap.lng)) {
      return { lat: snap.lat, lng: snap.lng }
    }
    const mobile = getPatrolMobileLiveSnapshot('HC-02')
    if (mobile?.streamOnline) {
      return { lat: PATROL_SITE_CENTER[0], lng: PATROL_SITE_CENTER[1] }
    }
    return snap && isValidGps(snap.lat, snap.lng)
      ? { lat: snap.lat, lng: snap.lng }
      : null
  }

  const pin = PATROL_MAP_ACTIVE_HELMET_PINS.find(p => p.id === cameraId)
  if (pin) return { lat: pin.position[0], lng: pin.position[1] }
  return { lat: PATROL_SITE_CENTER[0], lng: PATROL_SITE_CENTER[1] }
}

export function syncLivePatrolPersonDetectionsToHeatmap(
  cameraId: string,
  detections: MobileAiDetection[],
): void {
  if (!isPatrolHelmetCameraId(cameraId)) return

  const gps = resolvePatrolHeatmapGps(cameraId)
  if (!gps) return

  const tracks = tracksByCamera.get(cameraId) ?? new Map<string, PersonTrack>()
  tracksByCamera.set(cameraId, tracks)

  const persons = matchPersonTracks(detections, tracks)
  if (persons.length === 0) return

  const zoneId = PATROL_HELMET_ZONE_ASSIGNMENTS.find(z => z.helmetId === cameraId)?.zoneId
    ?? 'ZONE_SITE'

  const [matchedLat, matchedLng] = mapMatchPosition(gps.lat, gps.lng)

  upsertHeatmapPersons({
    cameraId,
    lat: matchedLat,
    lng: matchedLng,
    zoneId,
    persons,
  })
}

export function clearPatrolHeatmapLiveTracks(cameraId?: string): void {
  if (!cameraId) {
    tracksByCamera.clear()
    return
  }
  tracksByCamera.delete(cameraId)
}
