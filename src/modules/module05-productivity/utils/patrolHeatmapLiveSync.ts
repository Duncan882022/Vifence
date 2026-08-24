import { upsertHeatmapPersons } from '@/services/patrolHeatmapPersonRegistry'
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
  const [lat, lng] = [gps.lat, gps.lng]
  upsertHeatmapPersons({ cameraId, lat, lng, zoneId, persons })
}

/**
 * Sync live detections từ HC-* vào heatmap — chỉ dùng ROI-tracked persons (Người stage).
 * Không fallback sang PTR-LIVE hay OBS-* fake counts để giữ heatmap đúng spec.
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
}

export function clearPatrolHeatmapLiveTracks(cameraId?: string): void {
  clearPatrolPersonRoiEngine(cameraId)
}
