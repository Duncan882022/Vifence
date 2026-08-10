import { useMemo, useRef } from 'react'
import { isAtldViolationBehavior } from '../utils/roiBoxRole'
import {
  OVERLAY_MIN_CONFIDENCE,
  OVERLAY_MISS_GRACE_FRAMES,
} from '../utils/overlayVisibility'

type Bbox = [number, number, number, number]

export interface StickyOverlayDetection {
  behavior: string
  bbox: Bbox
  confidence: number
}

interface StickyTrack<T extends StickyOverlayDetection> {
  detection: T
  missCount: number
}

export interface ViolationStickyOverlayOptions<T extends StickyOverlayDetection> {
  minConfidence?: number
  missGraceFrames?: number
  isViolation?: (item: T) => boolean
  getTrackKey?: (item: T) => string
  /** DZ — thêm máy/cẩu liên quan khi có vi phạm crane_proximity. */
  appendRelated?: (visibleViolations: T[], allDetections: T[]) => T[]
}

function bboxIou(a: Bbox, b: Bbox): number {
  const ix1 = Math.max(a[0], b[0])
  const iy1 = Math.max(a[1], b[1])
  const ix2 = Math.min(a[2], b[2])
  const iy2 = Math.min(a[3], b[3])
  if (ix2 <= ix1 || iy2 <= iy1) return 0
  const inter = (ix2 - ix1) * (iy2 - iy1)
  const areaA = Math.max(0, a[2] - a[0]) * Math.max(0, a[3] - a[1])
  const areaB = Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1])
  const union = areaA + areaB - inter
  return union > 0 ? inter / union : 0
}

function defaultTrackKey(det: StickyOverlayDetection): string {
  const cx = Math.round((det.bbox[0] + det.bbox[2]) / 2 / 28)
  const cy = Math.round((det.bbox[1] + det.bbox[3]) / 2 / 28)
  return `${det.behavior}:${cx}:${cy}`
}

function matchIncoming<T extends StickyOverlayDetection>(
  track: StickyTrack<T>,
  incoming: T[],
  getTrackKey: (item: T) => string,
): T | undefined {
  const key = getTrackKey(track.detection)
  const sameKey = incoming.find(d => getTrackKey(d) === key)
  if (sameKey) return sameKey

  let best: T | undefined
  let bestIou = 0.18
  for (const det of incoming) {
    if (det.behavior !== track.detection.behavior) continue
    const iou = bboxIou(track.detection.bbox, det.bbox)
    if (iou > bestIou) {
      bestIou = iou
      best = det
    }
  }
  return best
}

/**
 * ROI camera — bám vi phạm đang phát hiện; chỉ ẩn khi mất detect hoặc conf < ngưỡng.
 */
export function useViolationStickyOverlay<T extends StickyOverlayDetection>(
  detections: T[],
  options: ViolationStickyOverlayOptions<T> = {},
): { visible: T[] } {
  const {
    minConfidence = OVERLAY_MIN_CONFIDENCE,
    missGraceFrames = OVERLAY_MISS_GRACE_FRAMES,
    isViolation = d => isAtldViolationBehavior(d.behavior),
    getTrackKey = defaultTrackKey,
    appendRelated,
  } = options

  const tracksRef = useRef<Map<string, StickyTrack<T>>>(new Map())

  return useMemo(() => {
    const incoming = detections.filter(
      d => isViolation(d) && d.confidence >= minConfidence,
    )

    const nextTracks = new Map<string, StickyTrack<T>>()
    const matchedIncoming = new Set<T>()

    for (const [, track] of tracksRef.current) {
      const hit = matchIncoming(track, incoming, getTrackKey)
      if (hit && hit.confidence >= minConfidence) {
        matchedIncoming.add(hit)
        nextTracks.set(getTrackKey(hit), {
          detection: hit,
          missCount: 0,
        })
        continue
      }

      const missCount = track.missCount + 1
      if (missCount <= missGraceFrames && track.detection.confidence >= minConfidence) {
        nextTracks.set(getTrackKey(track.detection), {
          detection: track.detection,
          missCount,
        })
      }
    }

    for (const det of incoming) {
      if (matchedIncoming.has(det)) continue
      nextTracks.set(getTrackKey(det), { detection: det, missCount: 0 })
    }

    tracksRef.current = nextTracks

    const violations = [...nextTracks.values()].map(t => t.detection)
    const visible = appendRelated ? appendRelated(violations, detections) : violations
    return { visible }
  }, [detections, minConfidence, missGraceFrames, isViolation, getTrackKey, appendRelated])
}
