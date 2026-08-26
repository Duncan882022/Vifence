import { getPatrolPersonRoiEngine, clearPatrolPersonRoiEngine } from '../personRoi/patrolPersonRoiEngine'
import { isPatrolMetricsCameraId } from '../data/patrolHelmetScope'
import type { MobileAiDetection } from '@/modules/module02-training/services/mobileAiBackend.service'

export { resolvePatrolHeatmapGps, resolvePatrolHeatmapGpsOrNull } from './patrolHeatmapGps'

/**
 * Cập nhật ROI overlay live — KPI và chấm bản đồ đọc từ SQLite day events,
 * không pin sgc-* vào session registry (tránh dot/count chồng track đứt).
 */
export function syncLivePatrolPersonDetectionsToHeatmap(
  cameraId: string,
  detections: MobileAiDetection[],
): void {
  if (!isPatrolMetricsCameraId(cameraId)) return
  getPatrolPersonRoiEngine(cameraId).ingest(detections)
}

export function clearPatrolHeatmapLiveTracks(cameraId?: string): void {
  clearPatrolPersonRoiEngine(cameraId)
}
