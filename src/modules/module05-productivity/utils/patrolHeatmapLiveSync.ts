import {
  upsertHeatmapPersons,
  syncHeatmapFramePresence,
} from '@/services/patrolHeatmapPersonRegistry'
import type { MobileAiDetection } from '@/modules/module02-training/services/mobileAiBackend.service'
import { getPatrolPersonRoiEngine, clearPatrolPersonRoiEngine } from '../personRoi/patrolPersonRoiEngine'
import { isPatrolHelmetCameraId } from '../data/patrolHelmetScope'
import { PATROL_HELMET_ZONE_ASSIGNMENTS } from '../data/patrolSiteMap'
import { resolvePatrolHeatmapGps } from './patrolHeatmapGps'

export { resolvePatrolHeatmapGps, resolvePatrolHeatmapGpsOrNull } from './patrolHeatmapGps'

function upsertPersonsAtPatrolGps(
  cameraId: string,
  persons: Array<{ personId: string; label: string; confidence: number }>,
): void {
  if (persons.length === 0) return
  const gps = resolvePatrolHeatmapGps(cameraId)
  const zoneId = PATROL_HELMET_ZONE_ASSIGNMENTS.find(z => z.helmetId === cameraId)?.zoneId
    ?? 'ZONE_SITE'
  upsertHeatmapPersons({
    cameraId,
    lat: gps.lat,
    lng: gps.lng,
    zoneId,
    inFrame: true,
    persons,
  })
}

/**
 * Sync live detections từ HC-* — in_frame blink; rời frame → inactive đến EOD.
 * Heat grid sample tách riêng (patrolHeatGrid) — re-pin không mất mật độ.
 */
export function syncLivePatrolPersonDetectionsToHeatmap(
  cameraId: string,
  detections: MobileAiDetection[],
): void {
  if (!isPatrolHelmetCameraId(cameraId)) return
  const engine = getPatrolPersonRoiEngine(cameraId)
  engine.ingest(detections)
  const persons = engine.getHeatmapPersons()
  if (persons.length > 0) {
    upsertPersonsAtPatrolGps(cameraId, persons)
  }
  syncHeatmapFramePresence(
    cameraId,
    persons.map(p => p.personId),
  )
}

export function clearPatrolHeatmapLiveTracks(cameraId?: string): void {
  clearPatrolPersonRoiEngine(cameraId)
}
