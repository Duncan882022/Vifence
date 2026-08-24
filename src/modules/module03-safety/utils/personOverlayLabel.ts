import { displayUnknown } from './displayUnknown'
import { formatRoiOverlayBadge, formatViolationRoiBadge } from './roiOverlayCode'

export interface PersonOverlayIdentity {
  workerId?: string | null
  workerName?: string | null
  faceMatchConfidence?: number | null
  faceMatchSource?: string | null
  /** Module 05 định danh thủ công — ưu tiên trước gallery/sgc. */
  manualDisplayName?: string | null
}

const FACE_MATCH_MIN = 0.72

function isUnknownWorkerName(name?: string | null): boolean {
  const trimmed = name?.trim()
  return !trimmed || trimmed.toLowerCase() === 'unknown'
}

/** Chỉ gắn tên công nhân khi khớp mặt gallery — không demo roster / cache khi quay lưng. */
export function isPatrolGalleryWorkerIdForOverlay(id?: string | null): boolean {
  if (!id) return false
  const t = id.trim()
  if (!t || t === 'unknown') return false
  if (/^sgc-/i.test(t) || /^obj-/i.test(t)) return false
  return /^(p-|w-|c-|u-|man-)/i.test(t)
}

export function isRecognizedWorker(identity: PersonOverlayIdentity): boolean {
  const id = identity.workerId?.trim()
  if (!id || id === 'unknown') return false
  if (/^sgc-/i.test(id)) return false
  if (isPatrolGalleryWorkerIdForOverlay(id)) {
    return !isUnknownWorkerName(identity.workerName)
  }
  if (isUnknownWorkerName(identity.workerName)) return false
  const source = identity.faceMatchSource?.trim()
  if (source && source !== 'face') return false
  if (identity.faceMatchConfidence == null || identity.faceMatchConfidence < FACE_MATCH_MIN) {
    return false
  }
  return true
}

/**
 * Nhãn bbox người trên cam (Module 05):
 * - định danh / gallery → tên
 * - Người (sgc) → mã sgc
 * - Đối tượng → OBJ-* hoặc 「Đối tượng」
 */
export function formatPersonOverlayLabel(
  workerName: string | null | undefined,
  identity?: PersonOverlayIdentity,
): string {
  const resolvedIdentity: PersonOverlayIdentity = identity ?? { workerName }
  const manual = resolvedIdentity.manualDisplayName?.trim()
  if (manual) return manual
  if (isRecognizedWorker(resolvedIdentity)) {
    return displayUnknown(resolvedIdentity.workerName)
  }
  const wid = resolvedIdentity.workerId?.trim()
  if (wid && /^sgc-/i.test(wid)) return wid
  return 'Đối tượng'
}

/** Nhãn bbox người — badge kèm conf. */
export function formatPersonOverlayBadge(
  workerName: string | null | undefined,
  confidence: number,
  suffix = '',
  identity?: PersonOverlayIdentity,
): string {
  return formatRoiOverlayBadge(
    formatPersonOverlayLabel(workerName, identity),
    confidence,
    suffix,
  )
}

/** Nhãn vi phạm PPE trên ROI — tên gallery + mã kịch bản khi đã nhận diện mặt. */
export function formatPpeViolationOverlayBadge(detection: {
  behavior: string
  confidence: number
  scenario_id?: string | null
  worker_id?: string | null
  worker_name?: string | null
  face_match_confidence?: number | null
  face_match_source?: string | null
}): string {
  const codeBadge = formatViolationRoiBadge(detection.behavior, detection.confidence, {
    scenarioId: detection.scenario_id,
  })
  const identity: PersonOverlayIdentity = {
    workerId: detection.worker_id,
    workerName: detection.worker_name,
    faceMatchConfidence: detection.face_match_confidence,
    faceMatchSource: detection.face_match_source,
  }
  if (!isRecognizedWorker(identity)) return codeBadge
  return `${displayUnknown(detection.worker_name)} · ${codeBadge}`
}

/** Siết bbox person overlay vào object detect (tránh khung rộng). */
export function tightenPersonOverlayBbox(
  bbox: number[],
  subjectBbox?: number[] | null,
): [number, number, number, number] {
  const src =
    subjectBbox && subjectBbox.length >= 4
      ? subjectBbox
      : bbox
  const x1 = Number(src[0])
  const y1 = Number(src[1])
  const x2 = Number(src[2])
  const y2 = Number(src[3])
  const w = Math.max(x2 - x1, 1)
  const h = Math.max(y2 - y1, 1)
  const ix = w * 0.05
  const iy = h * 0.03
  return [x1 + ix, y1 + iy, x2 - ix, y2 - iy]
}
