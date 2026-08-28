import type { DetectionDot } from '../data/patrolDetectionData'
import type { PatrolTier } from './patrolTierTokens'
import { isPatrolGalleryWorkerId } from './patrolIdentityEntity'
import { isPatrolObjectId, isPatrolPersId, isPatrolSgcWorkerId } from './patrolWorkforceEventLabels'

/** Màu chấm heatmap — đồng bộ ba tầng nhận diện patrol. */
export const PATROL_HEATMAP_DOT_HEX: Record<PatrolTier, string> = {
  object: '#f8fafc',
  person: '#4ade80',
  identity: '#a78bfa',
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
