import type { DetectionDot } from '../data/patrolDetectionData'
import { PATROL_TIER_TOKENS, type PatrolTier } from './patrolTierTokens'
import { isPatrolGalleryWorkerId } from './patrolIdentityEntity'
import { isPatrolObjectId, isPatrolPersId, isPatrolSgcWorkerId } from './patrolWorkforceEventLabels'

/** Flymap — một màu, không phân đối tượng / người / định danh. */
export const PATROL_FLYMAP_DOT_HEX = '#38bdf8'

/** Màu chấm heatmap — lấy từ PATROL_TIER_TOKENS (green / sky / violet). */
export const PATROL_HEATMAP_DOT_HEX: Record<PatrolTier, string> = {
  object: PATROL_TIER_TOKENS.object.heatmapDotHex,
  person: PATROL_TIER_TOKENS.person.heatmapDotHex,
  identity: PATROL_TIER_TOKENS.identity.heatmapDotHex,
}

export function resolveDetectionDotTier(
  dot: Pick<DetectionDot, 'tier' | 'verified' | 'objectId'>,
): PatrolTier {
  if (dot.tier === 'object') return 'object'
  // Flycam tầm cao — tier identity nhưng không badge định danh trên map.
  if (dot.tier === 'identity' && dot.verified === false) return 'person'
  if (dot.tier === 'identity') return 'identity'
  if (dot.verified) return 'identity'
  if (dot.tier === 'person') return 'person'
  const oid = dot.objectId?.trim() ?? ''
  if (isPatrolObjectId(oid) || /^obj-/i.test(oid)) return 'object'
  if (isPatrolGalleryWorkerId(oid)) return 'identity'
  if (isPatrolPersId(oid) || isPatrolSgcWorkerId(oid)) return 'person'
  return 'person'
}
