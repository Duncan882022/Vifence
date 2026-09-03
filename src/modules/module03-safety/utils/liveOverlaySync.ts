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

/**
 * Key ổn định theo cam + scene epoch — chỉ đổi khi cảnh thật sự đổi.
 *
 * Đổi key là xoá sạch track lock, tức mất luôn phần làm mượt giữa hai lần AI
 * chạy. Nếu đổi theo từng poll thì EMA không bao giờ tích được gì và hộp giật
 * từng nhịp — đúng cảm giác "box nhảy" trên tile live.
 *
 * Ba nguồn hợp lệ để đổi cảnh: `overlay_epoch` của backend (luồng dựng lại),
 * `source_pts_sec` nhảy/quay vòng (MP4 loop), và
 * {@link bumpVmsOverlaySceneEpoch} khi chính thẻ video seek.
 */
export function buildVmsOverlaySyncKey(snapshot: VmsDetectionSnapshot | null | undefined): string {
  if (!snapshot?.camera_id) return ''
  const cam = snapshot.camera_id
  const streamEpoch = snapshot.overlay_epoch ?? 0
  const pts = snapshot.source_pts_sec
  if (pts != null && Number.isFinite(pts)) {
    return `${cam}:${streamEpoch}:${detectSceneEpochBump(cam, pts)}`
  }
  return `${cam}:${streamEpoch}:${sceneEpochByCamera.get(cam) ?? 0}`
}
