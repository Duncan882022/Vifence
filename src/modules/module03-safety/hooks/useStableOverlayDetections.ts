import { useMemo, useRef } from 'react'
import {
  advanceBboxTrackLock,
  DEFAULT_TRACK_LOCK_CONFIG,
  type BboxDetection,
  type TrackLockConfig,
  type TrackLockState,
  type TrackedDetection,
} from '../utils/bboxTrackLock'

export type { TrackedDetection }

export interface StableOverlayOptions {
  trackLock?: Partial<TrackLockConfig>
  /** Đổi key → xóa track lock (VMS poll mới). */
  syncKey?: string
}

/**
 * Bám đối tượng trên overlay live — IoU track lock + làm mượt bbox.
 * Bỏ khoá khi IoU/conf thấp hoặc mất detect quá maxMissFrames.
 */
export function useStableOverlayDetections<T extends BboxDetection>(
  detections: T[],
  options?: StableOverlayOptions,
): Array<T & TrackedDetection<T>> {
  const tracksRef = useRef<Map<string, TrackLockState<T>>>(new Map())
  const lastSyncKeyRef = useRef<string | undefined>(undefined)
  const optionsRef = useRef(options)
  optionsRef.current = options
  const syncKey = options?.syncKey

  return useMemo(() => {
    if (syncKey !== undefined && syncKey !== lastSyncKeyRef.current) {
      tracksRef.current = new Map()
      lastSyncKeyRef.current = syncKey
    }
    const config: TrackLockConfig = {
      ...DEFAULT_TRACK_LOCK_CONFIG,
      ...optionsRef.current?.trackLock,
    }
    const { tracks, output } = advanceBboxTrackLock(tracksRef.current, detections, config)
    tracksRef.current = tracks
    return output
  }, [detections, syncKey])
}
