/** Patrol — gate hiển thị person HC-* (thân trên / cận mặt / đã có mã). */

import { isPatrolGalleryWorkerId } from './patrolIdentityEntity'

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

export function patrolPersonLegsOnlyBbox(bbox: Bbox4, _frameW: number, frameH: number): boolean {
  const [x1, y1, x2, y2] = bbox
  const ph = Math.max(y2 - y1, 1)
  const pw = Math.max(x2 - x1, 1)
  const cy = (y1 + y2) / 2
  const headCy = y1 + ph * 0.12
  const y1Ratio = y1 / Math.max(frameH, 1)
  const y2Ratio = y2 / Math.max(frameH, 1)
  const aspect = ph / Math.max(pw, 1)

  if (headCy > frameH * 0.54) return true
  if (cy > frameH * 0.72) return true
  if (y2Ratio > 0.86 && y1Ratio > 0.46 && aspect < 2.6) return true
  if (y1Ratio > 0.50 && y2Ratio > 0.88) return true
  return false
}

export function patrolPersonFaceDominantBbox(bbox: Bbox4, _frameW: number, frameH: number): boolean {
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

function plausiblePersonSilhouette(
  bbox: Bbox4,
  frameW: number,
  frameH: number,
  flycam = false,
): boolean {
  const [x1, y1, x2, y2] = bbox
  const pw = Math.max(x2 - x1, 1)
  const ph = Math.max(y2 - y1, 1)
  const aspect = ph / pw
  if (aspect > 4.2 || aspect < 0.28) return false
  const minW = flycam ? Math.max(6, frameW * 0.006) : Math.max(12, frameW * 0.035)
  const minH = flycam ? Math.max(8, frameH * 0.010) : Math.max(14, frameH * 0.04)
  if (pw < minW) return false
  if (ph < minH) return false
  return true
}

/** Người nhỏ/xa trên đường — quay lưng, không cần tín hiệu da (mirror BE). */
export function patrolWideCrowdRiderBox(bbox: Bbox4, frameW: number, frameH: number): boolean {
  if (patrolPersonLegsOnlyBbox(bbox, frameW, frameH)) return false
  const [x1, y1, x2, y2] = bbox
  const ph = Math.max(y2 - y1, 1)
  const pw = Math.max(x2 - x1, 1)
  const bhRatio = ph / Math.max(frameH, 1)
  const bwRatio = pw / Math.max(frameW, 1)
  const aspect = ph / pw
  if (bhRatio < 0.035 || bhRatio > 0.58) return false
  if (bwRatio < 0.022 || bwRatio > 0.40) return false
  if (aspect < 0.80 || aspect > 4.8) return false
  const cy = (y1 + y2) / 2
  if (cy < frameH * 0.06 || cy > frameH * 0.82) return false
  return true
}

/**
 * Mảnh thân nằm giữa khung và rộng hơn cao — bụng/đùi chứ không phải đầu +
 * thân trên, cũng không phải cận mặt. Mirror `patrol_person_visibility.py` (BE).
 */
export function patrolPersonMidFrameTorsoSliver(bbox: Bbox4, frameH: number): boolean {
  const [x1, y1, x2, y2] = bbox
  const pw = Math.max(x2 - x1, 1)
  const ph = Math.max(y2 - y1, 1)
  return y1 / Math.max(frameH, 1) > 0.35 && ph / pw < 1.0
}

export function patrolPersonMeetsUpperBodyGate(
  bbox: Bbox4,
  frameW: number,
  frameH: number,
): boolean {
  if (frameW <= 0 || frameH <= 0) return false
  if (patrolPersonLegsOnlyBbox(bbox, frameW, frameH)) return false
  if (patrolPersonMidFrameTorsoSliver(bbox, frameH)) return false
  const upperFrac = 0.30
  const headFrac = 0.24
  const minVisible = 0.33
  const minUpperPxFrac = 0.06
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

  const headCy = y1 + ph * headFrac * 0.5
  if (headCy > frameH * 0.58) return false
  if (y1 > frameH * 0.52) return false

  return true
}

export interface PatrolPersonDetectionGateInput {
  bbox: Bbox4
  frameW: number
  frameH: number
  workerId?: string | null
  /** Backend đã assess mặt — tab Người */
  faceEligible?: boolean
  /** DR-* flycam — người nhỏ từ góc cao */
  flycam?: boolean
}

/**
 * Gate vẽ ROI — rộng hơn gate ghi sự kiện.
 * Yêu cầu nghiệp vụ: khung hình bbox mọi người nhìn thấy được, còn "đầu + 30%
 * thân" chỉ quyết định có ghi sự kiện hay không (backend lo phần đó).
 * Ở đây chỉ loại mảnh chân/tay và khung không thể là người.
 */
export function patrolPersonMeetsDisplayGate(input: PatrolPersonDetectionGateInput): boolean {
  const { bbox, frameW, frameH, flycam = false } = input
  if (frameW <= 0 || frameH <= 0) return false
  if (!plausiblePersonSilhouette(bbox, frameW, frameH, flycam)) return false
  if (flycam) return true
  return !patrolPersonLegsOnlyBbox(bbox, frameW, frameH)
}

export function patrolPersonMeetsDetectionGate(input: PatrolPersonDetectionGateInput): boolean {
  const { bbox, frameW, frameH, workerId, faceEligible } = input
  if (patrolPersonLegsOnlyBbox(bbox, frameW, frameH)) return false
  if (!plausiblePersonSilhouette(bbox, frameW, frameH)) return false
  const wid = workerId?.trim() ?? ''
  if (wid && wid !== 'unknown' && isPatrolGalleryWorkerId(wid)) return true
  if (faceEligible) return true
  // Chỉ mặt thật (faceEligible) hoặc mã đã biết mới được bỏ qua hình học —
  // suy đoán "cận mặt" theo tỉ lệ khung không đủ căn cứ để ghi sự kiện.
  if (patrolPersonMidFrameTorsoSliver(bbox, frameH)) return false
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
