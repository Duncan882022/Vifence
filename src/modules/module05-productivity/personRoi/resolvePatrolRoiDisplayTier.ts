import { isPatrolGalleryWorkerId } from '../utils/patrolIdentityEntity'
import type { PersonRoiTier } from './types'

/**
 * Tier hiển thị trên ROI — đồng bộ tab Sự kiện (Người cần face_eligible).
 *
 * Backend lifecycle có thể thăng `person` sớm (1 frame + tk-*). Panel sự kiện
 * chặn bằng snapshotScore ≥ 1.05; camera dùng `face_eligible` tương đương live.
 * Định danh (gallery) luôn hiển thị tím dù quay lưng.
 */
export function resolvePatrolRoiDisplayTier(
  tier: PersonRoiTier,
  opts?: {
    faceEligible?: boolean
    workerId?: string | null
  },
): PersonRoiTier {
  if (tier === 'identity') return 'identity'
  if (tier === 'person') {
    if (opts?.faceEligible) return 'person'
    if (isPatrolGalleryWorkerId(opts?.workerId)) return 'person'
    return 'object'
  }
  return 'object'
}
