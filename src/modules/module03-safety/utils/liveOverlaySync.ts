import type { TrackLockConfig } from './bboxTrackLock'
import type { VmsDetectionSnapshot } from '../services/vmsDetections.service'

/** Live VMS tile — bbox bám khung poll hiện tại, không giữ ROI frame cũ. */
export const LIVE_TRACK_LOCK_CONFIG: Partial<TrackLockConfig> = {
  matchIouMin: 0.22,
  unlockIouMin: 0.1,
  maxMissFrames: 0,
  smoothAlpha: 1,
  minConfidence: 0.5,
  matchSameBehavior: true,
}

export const LIVE_MISS_GRACE_FRAMES = 0

export function buildVmsOverlaySyncKey(snapshot: VmsDetectionSnapshot | null | undefined): string {
  if (!snapshot) return ''
  const pts = snapshot.source_pts_sec
  return pts != null && Number.isFinite(pts)
    ? `${snapshot.updated_at}:${pts.toFixed(3)}`
    : String(snapshot.updated_at)
}
