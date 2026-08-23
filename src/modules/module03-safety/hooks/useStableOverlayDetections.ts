import { useEffect, useMemo, useRef, useState } from 'react'
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
  /** Dự đoán bbox giữa các poll analyze (bodycam mobile). */
  predictBetweenFrames?: boolean
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
  const predictBetweenFrames = options?.predictBetweenFrames ?? Boolean(options?.trackLock)

  const [predictTick, setPredictTick] = useState(0)

  useEffect(() => {
    if (!predictBetweenFrames) return
    let raf = 0
    let last = 0
    const loop = (now: number) => {
      if (now - last >= 33) {
        last = now
        setPredictTick(t => (t + 1) % 1_000_000)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [predictBetweenFrames])

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
  }, [detections, syncKey, predictTick, predictBetweenFrames])
}
