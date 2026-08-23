import type { MobileAiDetection } from '@/modules/module02-training/services/mobileAiBackend.service'
import { upsertHeatmapPersons } from '@/services/patrolHeatmapPersonRegistry'
import { getPatrolMobileLiveSnapshot } from '@/services/patrolMobileMetricsBridge'
import { getPatrolPersonRoiEngine, clearPatrolPersonRoiEngine } from '../personRoi/patrolPersonRoiEngine'
import { normalizePersonRoiDetections } from '../personRoi/personRoiTracker'
import { isPatrolHelmetCameraId } from '../data/patrolHelmetScope'
import { PATROL_HELMET_ZONE_ASSIGNMENTS } from '../data/patrolSiteMap'
import { resolvePatrolHeatmapGps } from './patrolHeatmapGps'
import { mapMatchPosition } from './positionEngine'

function isKnownWorker(id?: string | null): id is string {
  return Boolean(id && id.trim() && id !== 'unknown')
}

function personsFromRawDetections(
  detections: MobileAiDetection[],
): Array<{ personId: string; label: string; confidence: number }> {
  return normalizePersonRoiDetections(detections).map((d, i) => ({
    personId: isKnownWorker(d.worker_id) ? d.worker_id!.trim() : `PTR-LIVE-${i + 1}`,
    label: d.worker_name?.trim() || d.label?.trim() || 'person',
    confidence: d.confidence,
  }))
}

function personsFromObservedCount(
  cameraId: string,
  count: number,
): Array<{ personId: string; label: string; confidence: number }> {
  const n = Math.max(0, Math.min(Math.floor(count), 24))
  return Array.from({ length: n }, (_, i) => ({
    personId: `OBS-${cameraId}-${i + 1}`,
    label: `Quan sát #${i + 1}`,
    confidence: 0.82,
  }))
}

function upsertPersonsAtPatrolGps(
  cameraId: string,
  persons: Array<{ personId: string; label: string; confidence: number }>,
): void {
  if (persons.length === 0) return

  const gps = resolvePatrolHeatmapGps(cameraId)
  const zoneId = PATROL_HELMET_ZONE_ASSIGNMENTS.find(z => z.helmetId === cameraId)?.zoneId
    ?? 'ZONE_SITE'
  const [lat, lng] = mapMatchPosition(gps.lat, gps.lng)

  upsertHeatmapPersons({
    cameraId,
    lat,
    lng,
    zoneId,
    persons,
  })
}

export { resolvePatrolHeatmapGps, resolvePatrolHeatmapGpsOrNull } from './patrolHeatmapGps'

export function syncLivePatrolPersonDetectionsToHeatmap(
  cameraId: string,
  detections: MobileAiDetection[],
): void {
  if (!isPatrolHelmetCameraId(cameraId)) return

  const engine = getPatrolPersonRoiEngine(cameraId)
  engine.ingest(detections)

  let persons = engine.getHeatmapPersons()
  if (persons.length === 0) {
    persons = personsFromRawDetections(detections)
  }
  if (persons.length === 0) {
    const snap = getPatrolMobileLiveSnapshot(cameraId)
    const count = snap?.personCount ?? 0
    if (count > 0) {
      persons = personsFromObservedCount(cameraId, count)
    }
  }

  upsertPersonsAtPatrolGps(cameraId, persons)
}

/** Đồng bộ số quan sát (population KPI / sự kiện) → dot tại Cầu Sông Hốt khi chưa có track chi tiết. */
export function syncPatrolPopulationObservedToHeatmap(
  cameraId: string,
  observedCount: number,
): void {
  if (!isPatrolHelmetCameraId(cameraId) || observedCount <= 0) return

  const engine = getPatrolPersonRoiEngine(cameraId)
  const tracked = engine.getHeatmapPersons()
  if (tracked.length > 0) return

  upsertPersonsAtPatrolGps(cameraId, personsFromObservedCount(cameraId, observedCount))
}

export function clearPatrolHeatmapLiveTracks(cameraId?: string): void {
  clearPatrolPersonRoiEngine(cameraId)
}
