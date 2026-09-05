import { isPatrolGalleryWorkerId } from '../utils/patrolIdentityEntity'
import { resolvePatrolRoiObjectCode } from './resolvePatrolRoiDisplayLabel'
import type { PersonRoiTier } from './types'

/**
 * Tier hiển thị trên ROI — đồng bộ tab Sự kiện (Người cần face_eligible).
 *
 * Đã ghi hồ sơ từ obj-*: ROI hiển thị tầng Đối tượng + mã obj gốc, không badge "Người".
 * Định danh gallery luôn hiển thị tím dù quay lưng.
 */
export function resolvePatrolRoiDisplayTier(
  tier: PersonRoiTier,
  opts?: {
    faceEligible?: boolean
    workerId?: string | null
    promotedFrom?: string[]
  },
): PersonRoiTier {
  if (tier === 'identity') return 'identity'

  const objectCode = resolvePatrolRoiObjectCode({
    promotedFrom: opts?.promotedFrom,
    workerId: opts?.workerId,
  })
  if (objectCode && tier === 'person') {
    return 'object'
  }

  if (tier === 'person') {
    if (opts?.faceEligible) return 'person'
    if (isPatrolGalleryWorkerId(opts?.workerId)) return 'person'
    return 'object'
  }
  return 'object'
}
