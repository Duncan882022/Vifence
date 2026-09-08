import type { PersonRoiTier } from './types'
import { resolvePatrolTier } from '../utils/resolvePatrolTier'
import type { PatrolTierSnapshot } from '../types/patrolTierSnapshot'

/**
 * Tier hiển thị trên ROI — quay lưng / chưa mặt frame này → viền xám (object).
 * Tier nội bộ track vẫn chỉ tiến không lùi; chỉ màu ROI phản ánh mặt frame hiện tại.
 */
export function resolvePatrolRoiDisplayTier(
  tier: PersonRoiTier,
  opts?: {
    /** Mặt đủ tiêu chí trên frame đo cuối — không sticky cả track. */
    faceEligibleNow?: boolean
    faceEligible?: boolean
    workerId?: string | null
    promotedFrom?: string[]
    tierSnapshot?: PatrolTierSnapshot | null
  },
): PersonRoiTier {
  const base = resolvePatrolTier({
    tierSnapshot: opts?.tierSnapshot ?? undefined,
    tier,
    workerId: opts?.workerId,
    promotedFrom: opts?.promotedFrom,
    faceEligible: opts?.faceEligibleNow ?? opts?.faceEligible,
    surface: 'live-roi',
  })
  const faceNow = opts?.faceEligibleNow ?? opts?.faceEligible
  if (faceNow === false && base !== 'object') {
    return 'object'
  }
  return base
}
