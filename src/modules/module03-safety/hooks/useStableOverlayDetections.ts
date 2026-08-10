import { useMemo, useRef } from 'react'

type Bbox = [number, number, number, number]

interface BboxDetection {
  behavior: string
  bbox: Bbox
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

function blendBbox(current: Bbox, previous: Bbox, alpha = 0.55): Bbox {
  return [
    current[0] * alpha + previous[0] * (1 - alpha),
    current[1] * alpha + previous[1] * (1 - alpha),
    current[2] * alpha + previous[2] * (1 - alpha),
    current[3] * alpha + previous[3] * (1 - alpha),
  ]
}

function detectionKey(det: BboxDetection): string {
  const cx = Math.round((det.bbox[0] + det.bbox[2]) / 2 / 24)
  const cy = Math.round((det.bbox[1] + det.bbox[3]) / 2 / 24)
  return `${det.behavior}:${cx}:${cy}`
}

/** Làm mượt bbox giữa các khung — giảm hiện tượng box nhảy trên overlay live. */
export function useStableOverlayDetections<T extends BboxDetection>(
  detections: T[],
): T[] {
  const prevRef = useRef<Map<string, T>>(new Map())

  return useMemo(() => {
    const next = new Map<string, T>()
    const stabilized = detections.map(det => {
      const key = detectionKey(det)
      const prev = prevRef.current.get(key)
      if (!prev || bboxIou(det.bbox, prev.bbox) < 0.12) {
        next.set(key, det)
        return det
      }
      const merged = {
        ...det,
        bbox: blendBbox(det.bbox, prev.bbox),
      }
      next.set(key, merged)
      return merged
    })
    prevRef.current = next
    return stabilized
  }, [detections])
}
