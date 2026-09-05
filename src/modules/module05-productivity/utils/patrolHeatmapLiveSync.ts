import { getPatrolPersonRoiEngine, clearPatrolPersonRoiEngine } from '../personRoi/patrolPersonRoiEngine'
import { isPatrolMetricsCameraId } from '../data/patrolHelmetScope'
import type { MobileAiDetection } from '@/modules/module02-training/services/mobileAiBackend.service'

export { resolvePatrolHeatmapGps, resolvePatrolHeatmapGpsOrNull } from './patrolHeatmapGps'

const lastIngestFrameWallclockMs = new Map<string, number>()

/**
 * Cập nhật ROI overlay live — KPI và chấm bản đồ đọc từ SQLite day events,
 * không pin sgc-* vào session registry (tránh dot/count chồng track đứt).
 */
export function syncLivePatrolPersonDetectionsToHeatmap(
  cameraId: string,
  detections: MobileAiDetection[],
  frameWallclockMs?: number | null,
): void {
  if (!isPatrolMetricsCameraId(cameraId)) return
  if (frameWallclockMs != null && Number.isFinite(frameWallclockMs) && frameWallclockMs > 0) {
    const prev = lastIngestFrameWallclockMs.get(cameraId)
    if (prev === frameWallclockMs) return
    lastIngestFrameWallclockMs.set(cameraId, frameWallclockMs)
  }
  getPatrolPersonRoiEngine(cameraId).ingest(detections)
}

export function clearPatrolHeatmapLiveTracks(cameraId?: string): void {
  if (cameraId) {
    lastIngestFrameWallclockMs.delete(cameraId)
  } else {
    lastIngestFrameWallclockMs.clear()
  }
  clearPatrolPersonRoiEngine(cameraId)
}
