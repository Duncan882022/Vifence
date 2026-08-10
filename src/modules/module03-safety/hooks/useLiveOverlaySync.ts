import { useVmsDetections } from '../context/VmsDetectionContext'
import {
  buildVmsOverlaySyncKey,
  LIVE_MISS_GRACE_FRAMES,
  LIVE_TRACK_LOCK_CONFIG,
} from '../utils/liveOverlaySync'
import type { TrackLockConfig } from '../utils/bboxTrackLock'

export interface LiveOverlaySyncState {
  live: boolean
  syncKey: string
  trackLock: Partial<TrackLockConfig> | undefined
  missGraceFrames: number | undefined
  /** Không animate bbox — tránh cảm giác ROI frame cũ trượt sang frame mới. */
  snapOverlay: boolean
}

export function useLiveOverlaySync(): LiveOverlaySyncState {
  const vms = useVmsDetections()
  const live = Boolean(vms?.active)
  const syncKey = live ? buildVmsOverlaySyncKey(vms?.snapshot) : ''

  return {
    live,
    syncKey,
    trackLock: live ? LIVE_TRACK_LOCK_CONFIG : undefined,
    missGraceFrames: live ? LIVE_MISS_GRACE_FRAMES : undefined,
    snapOverlay: live,
  }
}
