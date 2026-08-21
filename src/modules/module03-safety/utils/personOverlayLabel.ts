import { displayUnknown } from './displayUnknown'
import { formatRoiOverlayBadge, formatViolationRoiBadge } from './roiOverlayCode'

export interface PersonOverlayIdentity {
  workerId?: string | null
  workerName?: string | null
  faceMatchConfidence?: number | null
  faceMatchSource?: string | null
}

const FACE_MATCH_MIN = 0.72

function isUnknownWorkerName(name?: string | null): boolean {
  const trimmed = name?.trim()
  return !trimmed || trimmed.toLowerCase() === 'unknown'
}

/** Chỉ gắn tên công nhân khi khớp mặt gallery — không demo roster / cache khi quay lưng. */
export function isRecognizedWorker(identity: PersonOverlayIdentity): boolean {
  const id = identity.workerId?.trim()
  if (!id || id === 'unknown') return false
  if (isUnknownWorkerName(identity.workerName)) return false
  const source = identity.faceMatchSource?.trim()
  if (source && source !== 'face') return false
  if (identity.faceMatchConfidence == null || identity.faceMatchConfidence < FACE_MATCH_MIN) {
    return false
  }
  return true
}

/** Nhãn bbox người — NV nếu chưa nhận diện, tên + % nếu khớp gallery. */
export function formatPersonOverlayBadge(
  workerName: string | null | undefined,
  confidence: number,
  suffix = '',
  identity?: PersonOverlayIdentity,
): string {
  const resolvedIdentity: PersonOverlayIdentity = identity ?? { workerName }
  const label = isRecognizedWorker(resolvedIdentity)
    ? displayUnknown(resolvedIdentity.workerName)
    : 'NV'
  return formatRoiOverlayBadge(label, confidence, suffix)
}

export function formatPersonOverlayLabel(
  workerName: string | null | undefined,
  identity?: PersonOverlayIdentity,
): string {
  const resolvedIdentity: PersonOverlayIdentity = identity ?? { workerName }
  return isRecognizedWorker(resolvedIdentity)
    ? displayUnknown(resolvedIdentity.workerName)
    : 'NV'
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
