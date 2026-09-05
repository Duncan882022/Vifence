/** Patrol — gate hiển thị person HC-* (thân trên / cận mặt / đã có mã). */

import { isPatrolGalleryWorkerId } from './patrolIdentityEntity'
import { PATROL_TIER_RANK, type PatrolTier } from './patrolTierTokens'

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

function signboardLikeFpBox(bbox: Bbox4, frameW: number, frameH: number): boolean {
  const [x1, y1, x2, y2] = bbox
  const pw = Math.max(x2 - x1, 1)
  const ph = Math.max(y2 - y1, 1)
  const aspect = ph / pw
  const bwRatio = pw / Math.max(frameW, 1)
  const bhRatio = ph / Math.max(frameH, 1)
  const areaRatio = (pw * ph) / Math.max(frameW * frameH, 1)
  const cy = (y1 + y2) / 2
  const y1Ratio = y1 / Math.max(frameH, 1)
  const y2Ratio = y2 / Math.max(frameH, 1)

  if (aspect < 0.78 && y1Ratio < 0.38 && bhRatio < 0.42) {
    if (bwRatio >= 0.14 && areaRatio >= 0.035) return true
    if (bwRatio >= 0.20 && bhRatio >= 0.05) return true
  }
  if (aspect < 0.52 && cy < frameH * 0.36 && bwRatio >= 0.22) return true
  if (
    aspect < 0.95
    && y2Ratio < 0.42
    && bwRatio >= 0.18
    && areaRatio >= 0.05
    && cy < frameH * 0.28
  ) {
    return true
  }
  return false
}

function verticalStructureFpBox(bbox: Bbox4, frameW: number, frameH: number): boolean {
  const [x1, y1, x2, y2] = bbox
  const pw = Math.max(x2 - x1, 1)
  const ph = Math.max(y2 - y1, 1)
  const aspect = ph / pw
  const bwRatio = pw / Math.max(frameW, 1)
  const bhRatio = ph / Math.max(frameH, 1)
  if (aspect > 2.6 && bwRatio < 0.075 && bhRatio > 0.10) return true
  if (aspect < 0.30 && bhRatio < 0.055 && bwRatio > 0.20) return true
  return false
}

const SPECK_BOX_MAX_HEIGHT_RATIO = 0.07

/**
 * Hộp quá nhỏ để là bằng chứng về một con người.
 *
 * Đo trên HC-01 thật: 9/11 hộp lọt cổng ghi thẻ cao 20–29 px trong khung cao
 * 540, nằm nửa trên khung tức bên kia đường; cắt ra chỉ là vệt mờ. Chặn theo
 * kích thước tuyệt đối chứ không theo tỉ lệ cao/rộng — rác trải từ tỉ lệ 0.95
 * đến 1.63 nên mọi ngưỡng tỉ lệ đều để lại khe hở mà rác dồn vào đúng đó.
 *
 * Mirror `speck_person_box` bên backend.
 */
function speckPersonBox(bbox: Bbox4, frameH: number): boolean {
  const ph = Math.max(bbox[3] - bbox[1], 1)
  return ph / Math.max(frameH, 1) < SPECK_BOX_MAX_HEIGHT_RATIO
}

function wideCrowdRiderBox(bbox: Bbox4, frameW: number, frameH: number): boolean {
  if (patrolPersonLegsOnlyBbox(bbox, frameW, frameH)) return false
  const [x1, y1, x2, y2] = bbox
  const ph = Math.max(y2 - y1, 1)
  const pw = Math.max(x2 - x1, 1)
  const bhRatio = ph / Math.max(frameH, 1)
  const bwRatio = pw / Math.max(frameW, 1)
  const aspect = ph / pw
  const cy = (y1 + y2) / 2
  if (bhRatio < 0.035 || bhRatio > 0.65) return false
  if (bwRatio < 0.018 || bwRatio > 0.42) return false
  if (aspect < 0.65 || aspect > 4.8) return false
  if (cy < frameH * 0.06 || cy > frameH * 0.82) return false
  return true
}

function plausiblePersonSilhouette(
  bbox: Bbox4,
  frameW: number,
  frameH: number,
  flycam = false,
  patrolDisplay = false,
): boolean {
  const [x1, y1, x2, y2] = bbox
  const pw = Math.max(x2 - x1, 1)
  const ph = Math.max(y2 - y1, 1)
  const aspect = ph / pw
  if (flycam) {
    // Nhìn từ trên xuống, người ngồi hoặc cúi co lại thành khối rộng hơn cao.
    // Giữ sàn 0.28 của góc ngang là loại đúng những trường hợp đó.
    if (aspect > 6.5 || aspect < 0.12) return false
    if (pw < Math.max(6, frameW * 0.006)) return false
    if (ph < Math.max(8, frameH * 0.010)) return false
    return true
  }
  const minPwFrac = patrolDisplay ? 0.012 : 0.035
  const minPhFrac = patrolDisplay ? 0.018 : 0.04
  if (aspect > 4.2 || aspect < 0.28) return false
  if (pw < Math.max(patrolDisplay ? 8 : 12, frameW * minPwFrac)) return false
  if (ph < Math.max(patrolDisplay ? 10 : 14, frameH * minPhFrac)) return false
  return true
}

/**
 * Bbox chỉ là mảnh chi thể — mảnh vỡ của người đã được khoanh ở box khác.
 *
 * Hẹp hơn hẳn `patrolPersonLegsOnlyBbox`. Hàm kia coi mọi bbox có vùng đầu nằm
 * dưới 54% chiều cao khung là chân, nên người **ngồi** nhìn từ camera đội đầu —
 * vốn luôn rơi xuống nửa dưới khung — cũng bị loại. Chặt như vậy đúng cho đường
 * ghi sự kiện, nhưng với đường vẽ ROI thì mất đúng nhóm cần thấy nhất.
 *
 * Mirror `limb_fragment_person_box` bên backend.
 */
export function patrolPersonLimbFragmentBbox(
  bbox: Bbox4,
  _frameW: number,
  frameH: number,
): boolean {
  const [x1, y1, x2, y2] = bbox
  const pw = Math.max(x2 - x1, 1)
  const ph = Math.max(y2 - y1, 1)
  const aspect = ph / pw
  const y1Ratio = y1 / Math.max(frameH, 1)
  const y2Ratio = y2 / Math.max(frameH, 1)

  if (aspect >= 2.2 && y1Ratio > 0.52 && y2Ratio > 0.80) return true
  if (y1Ratio > 0.62 && y2Ratio > 0.97) return true
  return false
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
  if (bhRatio < 0.035 || bhRatio > 0.65) return false
  if (bwRatio < 0.018 || bwRatio > 0.42) return false
  if (aspect < 0.65 || aspect > 4.8) return false
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
  /** DR-* flycam tầm cao — người nhỏ từ góc cao */
  flycam?: boolean
  /** DR-* flycam tầm thấp — gate rộng như mũ */
  proximityFlycam?: boolean
}

/**
 * Gate vẽ ROI — rộng hơn gate ghi sự kiện.
 * Yêu cầu nghiệp vụ: khoanh mọi thứ có dấu hiệu là người, kể cả người ngồi, bị
 * che một phần hay quay lưng. Ràng buộc "đầu + 30% thân" chỉ quyết định có ghi
 * sự kiện hay không.
 * Ở đây chỉ loại mảnh chân/tay và khung không thể là người.
 */
export function patrolPersonMeetsDisplayGate(input: PatrolPersonDetectionGateInput): boolean {
  const { bbox, frameW, frameH, flycam = false, proximityFlycam = false } = input
  if (frameW <= 0 || frameH <= 0) return false
  if (verticalStructureFpBox(bbox, frameW, frameH)) return false
  if (signboardLikeFpBox(bbox, frameW, frameH)) return false
  if (flycam) {
    return plausiblePersonSilhouette(bbox, frameW, frameH, true)
  }
  if (proximityFlycam) {
    if (wideCrowdRiderBox(bbox, frameW, frameH)) return true
    if (!plausiblePersonSilhouette(bbox, frameW, frameH, false, true)) return false
    return !patrolPersonLimbFragmentBbox(bbox, frameW, frameH)
  }
  // Chỉ góc mặt đất: vệt vuông vài chục pixel bên kia đường không phải người.
  if (speckPersonBox(bbox, frameH)) return false
  if (wideCrowdRiderBox(bbox, frameW, frameH)) return true
  if (!plausiblePersonSilhouette(bbox, frameW, frameH, false, true)) return false
  return !patrolPersonLimbFragmentBbox(bbox, frameW, frameH)
}

/**
 * DR-* — thử cả gate aerial lẫn proximity cho mỗi bbox.
 * Tránh lệch flight_mode (cache bridge vs metrics) làm mất ROI tầm cao.
 */
export function patrolPersonMeetsDrFlycamDisplayGate(
  input: Omit<PatrolPersonDetectionGateInput, 'flycam' | 'proximityFlycam'>,
): boolean {
  return (
    patrolPersonMeetsDisplayGate({ ...input, flycam: true })
    || patrolPersonMeetsDisplayGate({ ...input, proximityFlycam: true })
  )
}

export function patrolPersonMeetsDetectionGate(input: PatrolPersonDetectionGateInput): boolean {
  const { bbox, frameW, frameH, workerId, faceEligible } = input
  if (patrolPersonLegsOnlyBbox(bbox, frameW, frameH)) return false
  if (signboardLikeFpBox(bbox, frameW, frameH)) return false
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

function bboxArea(bbox: Bbox4): number {
  return Math.max(0, bbox[2] - bbox[0]) * Math.max(0, bbox[3] - bbox[1])
}

function patrolDetectionsOverlap(a: Bbox4, b: Bbox4): boolean {
  return bboxIou(a, b) >= 0.34 || bboxContainment(a, b) >= 0.46
}

/** Suy tầng từ payload backend khi thiếu field `tier`. */
export function resolvePatrolDetectionTier(input: {
  tier?: PatrolTier | null
  worker_id?: string | null
}): PatrolTier {
  if (input.tier) return input.tier
  const wid = input.worker_id?.trim() ?? ''
  if (!wid || wid === 'unknown') return 'object'
  if (/^ptk/i.test(wid) || /:person$/i.test(wid)) return 'object'
  if (isPatrolGalleryWorkerId(wid)) return 'identity'
  if (/^iden-/i.test(wid)) return 'identity'
  if (/^(tk-|sgc-|pers-)/i.test(wid)) return 'person'
  return 'object'
}

function patrolKnownWorkerId(workerId?: string | null): string {
  const wid = workerId?.trim() ?? ''
  if (!wid || wid === 'unknown') return ''
  return wid
}

function patrolDetectionsSamePerson(a: Bbox4, b: Bbox4, frameW: number, frameH: number): boolean {
  if (!patrolDetectionsOverlap(a, b)) return false
  const acx = (a[0] + a[2]) / 2
  const acy = (a[1] + a[3]) / 2
  const bcx = (b[0] + b[2]) / 2
  const bcy = (b[1] + b[3]) / 2
  const dx = (acx - bcx) / Math.max(frameW, 1)
  const dy = (acy - bcy) / Math.max(frameH, 1)
  if (Math.sqrt(dx * dx + dy * dy) >= 0.045) return false
  return true
}

/**
 * Một người chỉ một ROI — tầng cao thắng (Định danh > Người > Đối tượng).
 * Hai người đã có mã khác nhau vẫn giữ cả hai dù bbox chồng nhau.
 */
export function suppressPatrolObjectOverlappingIdentified<T extends {
  behavior: string
  bbox: Bbox4
  confidence?: number
  worker_id?: string | null
  track_id?: string | null
  tier?: PatrolTier | null
}>(
  detections: T[],
  frameW = 1280,
  frameH = 720,
): T[] {
  const persons = detections.filter(d => d.behavior === 'person' && d.bbox?.length === 4)
  if (persons.length <= 1) return detections

  const ranked = persons.map(d => ({
    d,
    tier: resolvePatrolDetectionTier(d),
    area: bboxArea(d.bbox as Bbox4),
    conf: d.confidence ?? 0,
  }))
  ranked.sort((a, b) => (
    PATROL_TIER_RANK[b.tier] - PATROL_TIER_RANK[a.tier]
    || b.area - a.area
    || b.conf - a.conf
  ))

  const kept: typeof ranked = []
  const dropped = new Set<T>()

  for (const candidate of ranked) {
    const dominated = kept.some(keptDet => {
      if (!patrolDetectionsSamePerson(
        candidate.d.bbox as Bbox4,
        keptDet.d.bbox as Bbox4,
        frameW,
        frameH,
      )) return false
      const candRank = PATROL_TIER_RANK[candidate.tier]
      const keptRank = PATROL_TIER_RANK[keptDet.tier]
      if (keptRank > candRank) return true
      if (keptRank < candRank) return false
      if (keptRank >= PATROL_TIER_RANK.person) {
        const candWid = patrolKnownWorkerId(candidate.d.worker_id)
        const keptWid = patrolKnownWorkerId(keptDet.d.worker_id)
        if (candWid && keptWid && candWid !== keptWid) return false
      }
      const candTrack = candidate.d.track_id?.trim() ?? ''
      const keptTrack = keptDet.d.track_id?.trim() ?? ''
      if (candTrack && keptTrack && candTrack !== keptTrack) return false
      return true
    })
    if (dominated) {
      dropped.add(candidate.d)
    } else {
      kept.push(candidate)
    }
  }

  if (dropped.size === 0) return detections
  return detections.filter(d => !dropped.has(d))
}
