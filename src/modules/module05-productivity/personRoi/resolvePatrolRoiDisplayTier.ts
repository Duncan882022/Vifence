import type { PersonRoiTier } from './types'
import { resolvePatrolTier } from '../utils/resolvePatrolTier'
import type { PatrolTierSnapshot } from '../types/patrolTierSnapshot'

/**
 * Tier hiển thị trên ROI — đọc tier_snapshot, không hạ person→object.
 */
export function resolvePatrolRoiDisplayTier(
  tier: PersonRoiTier,
  opts?: {
    faceEligible?: boolean
    workerId?: string | null
    promotedFrom?: string[]
    tierSnapshot?: PatrolTierSnapshot | null
  },
): PersonRoiTier {
  return resolvePatrolTier({
    tierSnapshot: opts?.tierSnapshot ?? undefined,
    tier,
    workerId: opts?.workerId,
    promotedFrom: opts?.promotedFrom,
    faceEligible: opts?.faceEligible,
    surface: 'live-roi',
  })
}
