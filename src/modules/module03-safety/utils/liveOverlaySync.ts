import type { TrackLockConfig } from './bboxTrackLock'
import type { VmsDetectionSnapshot } from '../services/vmsDetections.service'

/** Live VMS tile — EMA + track lock giữa các poll (~6 FPS), không reset mỗi poll. */
export const LIVE_TRACK_LOCK_CONFIG: Partial<TrackLockConfig> = {
  matchIouMin: 0.22,
  unlockIouMin: 0.1,
  maxMissFrames: 2,
  smoothAlpha: 0.42,
  minConfidence: 0.5,
  matchSameBehavior: true,
}

export const LIVE_MISS_GRACE_FRAMES = 2

/** Bodycam HC-* — IoU + center match + rAF chase giữa các frame analyze. */
export const MOBILE_TRACK_LOCK_CONFIG: Partial<TrackLockConfig> = {
  matchIouMin: 0.1,
  unlockIouMin: 0.035,
  maxMissFrames: 14,
  smoothAlpha: 0.97,
  minConfidence: 0.38,
  matchSameBehavior: true,
  centerMatchRatio: 0.42,
}

const lastPtsByCamera = new Map<string, number>()
const sceneEpochByCamera = new Map<string, number>()

/** Video loop / seek trên tile — reset track lock giữa các poll. */
export function bumpVmsOverlaySceneEpoch(cameraId: string): void {
  const next = (sceneEpochByCamera.get(cameraId) ?? 0) + 1
  sceneEpochByCamera.set(cameraId, next)
  lastPtsByCamera.delete(cameraId)
}

/**
 * Xóa state overlay PPE giữa các poll — **không** reset PatrolPersonRoiEngine:
 * engine patrol tự cập nhật qua ingest/Kalman; clear mỗi poll + ingest trễ (sync
 * buffer) làm tile drone/bodycam mất ROI dù backend vẫn trả detections.
 */
export function clearVmsDetectionOverlayFrame(cameraId: string): void {
  if (!cameraId) return
  bumpVmsOverlaySceneEpoch(cameraId)
}

function detectSceneEpochBump(cameraId: string, pts: number): number {
  let epoch = sceneEpochByCamera.get(cameraId) ?? 0
  const prev = lastPtsByCamera.get(cameraId)
  if (prev != null && Number.isFinite(prev)) {
    const looped = pts < prev - 0.08
    const jumped = pts - prev > 0.45
    if (looped || jumped) {
      epoch += 1
      sceneEpochByCamera.set(cameraId, epoch)
    }
  }
  lastPtsByCamera.set(cameraId, pts)
  return epoch
}

/** Key ổn định theo cam + scene epoch — chỉ đổi khi loop/nhảy cảnh, không theo từng poll. */
export function buildVmsOverlaySyncKey(snapshot: VmsDetectionSnapshot | null | undefined): string {
  if (!snapshot?.camera_id) return ''
  const cam = snapshot.camera_id
  const pts = snapshot.source_pts_sec
  if (pts != null && Number.isFinite(pts)) {
    const epoch = detectSceneEpochBump(cam, pts)
    return `${cam}:${epoch}`
  }
  const epoch = sceneEpochByCamera.get(cam) ?? 0
  return `${cam}:${epoch}`
}
