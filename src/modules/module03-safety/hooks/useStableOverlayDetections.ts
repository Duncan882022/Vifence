import { useEffect, useMemo, useRef, useState } from 'react'
import {
  advanceBboxTrackLock,
  DEFAULT_TRACK_LOCK_CONFIG,
  extrapolateTrackLockOutput,
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
 * Bám đối tượng trên overlay live — IoU track lock + rAF chase giữa các poll analyze.
 */
export function useStableOverlayDetections<T extends BboxDetection>(
  detections: T[],
  options?: StableOverlayOptions,
): Array<T & TrackedDetection<T>> {
  const tracksRef = useRef<Map<string, TrackLockState<T>>>(new Map())
  const lastSyncKeyRef = useRef<string | undefined>(undefined)
  const lastAnalyzeAtRef = useRef(0)
  const baseOutputRef = useRef<Array<T & TrackedDetection<T>>>([])
  const optionsRef = useRef(options)
  optionsRef.current = options
  const syncKey = options?.syncKey
  const predictBetweenFrames = options?.predictBetweenFrames ?? Boolean(options?.trackLock)

  const [baseTick, setBaseTick] = useState(0)
  const [predictTick, setPredictTick] = useState(0)

  useEffect(() => {
    if (syncKey !== undefined && syncKey !== lastSyncKeyRef.current) {
      tracksRef.current = new Map()
      lastSyncKeyRef.current = syncKey
      lastAnalyzeAtRef.current = 0
    }

    const now = performance.now()
    const dtMs = lastAnalyzeAtRef.current > 0
      ? Math.max(16, now - lastAnalyzeAtRef.current)
      : 450
    lastAnalyzeAtRef.current = now

    const config: TrackLockConfig = {
      ...DEFAULT_TRACK_LOCK_CONFIG,
      ...optionsRef.current?.trackLock,
    }
    const { tracks, output } = advanceBboxTrackLock(tracksRef.current, detections, config, dtMs)
    tracksRef.current = tracks
    baseOutputRef.current = output
    setBaseTick(t => t + 1)
  }, [detections, syncKey])

  useEffect(() => {
    if (!predictBetweenFrames) return
    let raf = 0
    let last = 0
    const loop = (now: number) => {
      if (now - last >= 16) {
        last = now
        setPredictTick(t => (t + 1) % 1_000_000)
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [predictBetweenFrames])

  return useMemo(() => {
    void baseTick
    if (!predictBetweenFrames) return baseOutputRef.current

    const elapsed = performance.now() - lastAnalyzeAtRef.current
    if (elapsed < 12 || tracksRef.current.size === 0) {
      return baseOutputRef.current
    }

    const predicted = extrapolateTrackLockOutput(tracksRef.current, elapsed)
    return predicted.length > 0 ? predicted : baseOutputRef.current
  }, [baseTick, predictTick, predictBetweenFrames])
}
