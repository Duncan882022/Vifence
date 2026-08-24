/** Patrol — gate hiển thị person HC-* (thân trên / cận mặt / đã có mã). */

export type Bbox4 = [number, number, number, number]

function clipBoxToFrame(box: Bbox4, frameW: number, frameH: number): Bbox4 {
  const [x1, y1, x2, y2] = box
  return [
    Math.max(0, Math.min(frameW, x1)),
    Math.max(0, Math.min(frameH, y1)),
    Math.max(0, Math.min(frameW, x2)),
    Math.max(0, Math.min(frameH, y2)),
  ]
}

function zoneVisibleRatio(zone: Bbox4, frameW: number, frameH: number): number {
  const [, zy1, , zy2] = zone
  const rawH = Math.max(zy2 - zy1, 1)
  const [, cy1, , cy2] = clipBoxToFrame(zone, frameW, frameH)
  if (cy2 <= cy1) return 0
  return (cy2 - cy1) / rawH
}

export function patrolPersonFaceDominantBbox(bbox: Bbox4, frameW: number, frameH: number): boolean {
  const [x1, y1, x2, y2] = bbox
  const ph = Math.max(y2 - y1, 1)
  const pw = Math.max(x2 - x1, 1)
  const aspect = pw / ph
  const bhRatio = ph / Math.max(frameH, 1)
  if (aspect >= 0.72 && bhRatio < 0.62) return true
  if (y1 < frameH * 0.12 && y2 < frameH * 0.62 && bhRatio < 0.55) return true
  if (aspect >= 0.55 && bhRatio < 0.42) return true
  if (bhRatio >= 0.38 && aspect >= 0.42 && aspect <= 1.35) return true
  return false
}

function plausiblePersonSilhouette(bbox: Bbox4, frameW: number, frameH: number): boolean {
  const [x1, y1, x2, y2] = bbox
  const pw = Math.max(x2 - x1, 1)
  const ph = Math.max(y2 - y1, 1)
  const aspect = ph / pw
  if (aspect > 4.2 || aspect < 0.28) return false
  if (pw < Math.max(12, frameW * 0.035)) return false
  if (ph < Math.max(16, frameH * 0.06)) return false
  return true
}

export function patrolPersonMeetsUpperBodyGate(
  bbox: Bbox4,
  frameW: number,
  frameH: number,
): boolean {
  if (frameW <= 0 || frameH <= 0) return false
  const upperFrac = 0.50
  const headFrac = 0.24
  const minVisible = 0.33
  const minUpperPxFrac = 0.08
  const minHeadPxFrac = 0.04

  const [x1, y1, x2, y2] = bbox
  const ph = Math.max(y2 - y1, 1)
  const pw = Math.max(x2 - x1, 1)
  const head: Bbox4 = [x1 + pw * 0.10, y1, x2 - pw * 0.10, y1 + ph * headFrac]
  const upper: Bbox4 = [x1 + pw * 0.05, y1, x2 - pw * 0.05, y1 + ph * upperFrac]

  const headVis = zoneVisibleRatio(head, frameW, frameH)
  const upperVis = zoneVisibleRatio(upper, frameW, frameH)
  if (headVis < minVisible || upperVis < minVisible) return false

  const visibleUpperH = upperVis * ph * upperFrac
  const visibleHeadH = headVis * ph * headFrac
  if (visibleUpperH < frameH * minUpperPxFrac) return false
  if (visibleHeadH < frameH * minHeadPxFrac) return false

  const y1Ratio = y1 / frameH
  const bhRatio = ph / frameH
  if (y1Ratio > 0.62 && bhRatio < 0.18) return false

  return true
}

export interface PatrolPersonDetectionGateInput {
  bbox: Bbox4
  frameW: number
  frameH: number
  workerId?: string | null
}

export function patrolPersonMeetsDetectionGate(input: PatrolPersonDetectionGateInput): boolean {
  const { bbox, frameW, frameH, workerId } = input
  if (!plausiblePersonSilhouette(bbox, frameW, frameH)) return false
  const wid = workerId?.trim() ?? ''
  if (wid && wid !== 'unknown' && /^sgc-/i.test(wid)) return true
  if (patrolPersonFaceDominantBbox(bbox, frameW, frameH)) return true
  return patrolPersonMeetsUpperBodyGate(bbox, frameW, frameH)
}

function bboxIou(a: Bbox4, b: Bbox4): number {
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

function bboxContainment(a: Bbox4, b: Bbox4): number {
  const ix1 = Math.max(a[0], b[0])
  const iy1 = Math.max(a[1], b[1])
  const ix2 = Math.min(a[2], b[2])
  const iy2 = Math.min(a[3], b[3])
  if (ix2 <= ix1 || iy2 <= iy1) return 0
  const inter = (ix2 - ix1) * (iy2 - iy1)
  const areaA = Math.max(0, a[2] - a[0]) * Math.max(0, a[3] - a[1])
  const areaB = Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1])
  const smaller = Math.min(areaA, areaB)
  return smaller > 0 ? inter / smaller : 0
}

/** Ẩn Đối tượng yếu trùng vùng với người đã có sgc. */
export function suppressPatrolObjectOverlappingIdentified<T extends { behavior: string; bbox: Bbox4; worker_id?: string | null }>(
  detections: T[],
): T[] {
  const identified = detections.filter(
    d => d.behavior === 'person'
      && d.bbox?.length === 4
      && d.worker_id
      && d.worker_id !== 'unknown'
      && /^sgc-/i.test(d.worker_id),
  )
  if (identified.length === 0) return detections
  return detections.filter(d => {
    if (d.behavior !== 'person' || !d.bbox || d.bbox.length < 4) return true
    const wid = d.worker_id?.trim() ?? ''
    if (wid && wid !== 'unknown') return true
    return !identified.some(id =>
      bboxIou(d.bbox as Bbox4, id.bbox as Bbox4) >= 0.12
      || bboxContainment(d.bbox as Bbox4, id.bbox as Bbox4) >= 0.35,
    )
  })
}
