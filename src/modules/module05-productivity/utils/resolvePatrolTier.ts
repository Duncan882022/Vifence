/**
 * Nguồn sự thật duy nhất cho tầng hiển thị — ROI, thẻ sự kiện, heatmap.
 * Đọc tier_snapshot từ BE; không hạ person→object sau khi đã rõ mặt.
 */

import type { PatrolTierSnapshot, PatrolTierLevel } from '../types/patrolTierSnapshot'
import { higherPatrolTierLevel, PATROL_TIER_LEVEL_RANK } from '../types/patrolTierSnapshot'
import type { PatrolEvent } from '../data/patrolTypes'
import { isPatrolGalleryWorkerId } from './patrolIdentityEntity'
import { isPatrolTrackWorkerId, isPatrolPersId } from './patrolWorkforceEventLabels'
import { PATROL_OBJECT_FACE_SNAPSHOT_SCORE } from './patrolDayObjectFilter'

export type PatrolTier = PatrolTierLevel
export type PatrolPersonStage = 'object' | 'person' | 'profile'

export interface ResolvePatrolTierInput {
  tierSnapshot?: PatrolTierSnapshot | null
  tier?: PatrolTier | 'profile' | null
  stage?: PatrolPersonStage | null
  workerId?: string | null
  objectId?: string | null
  trackWorkerId?: string | null
  faceEligible?: boolean
  snapshotScore?: number
  promotedFrom?: string[]
  verified?: boolean
  surface?: 'live-roi' | 'event' | 'detection-inference' | 'heatmap-dot'
}

function normalizeTierInput(tier?: string | null): PatrolTier | null {
  const t = (tier || '').trim()
  if (t === 'profile') return 'identity'
  if (t === 'object' || t === 'person' || t === 'identity') return t
  return null
}

function inferTierFromIds(input: ResolvePatrolTierInput): PatrolTier {
  const wid = (input.workerId || input.trackWorkerId || '').trim()
  if (isPatrolGalleryWorkerId(wid)) return 'identity'
  if (isPatrolTrackWorkerId(wid) || isPatrolPersId(wid)) return 'person'
  const oid = (input.objectId || '').trim()
  if (isPatrolPersId(oid)) return 'person'
  if (oid.toLowerCase().startsWith('obj-')) return 'object'
  return 'object'
}

/**
 * Tầng hiển thị chỉ tiến không lùi — lấy max(tier_snapshot, tier_ever, suy từ mã).
 * Không để tier_snapshot lúc flush (object) che tier_ever person trên thẻ tk-*.
 */
function coalescePatrolTierSignals(input: ResolvePatrolTierInput): PatrolTier {
  let tier: PatrolTier = 'object'

  const snapTier = normalizeTierInput(input.tierSnapshot?.tier)
  const everTier =
    normalizeTierInput(input.tier)
    ?? normalizeTierInput(input.stage)

  if (snapTier) tier = higherPatrolTierLevel(tier, snapTier)
  if (everTier) tier = higherPatrolTierLevel(tier, everTier)

  const inferred = inferTierFromIds(input)
  tier = higherPatrolTierLevel(tier, inferred)

  if ((input.snapshotScore ?? 0) >= PATROL_OBJECT_FACE_SNAPSHOT_SCORE) {
    const personCard =
      everTier === 'person'
      || everTier === 'identity'
      || inferred === 'person'
      || inferred === 'identity'
    if (personCard) {
      tier = higherPatrolTierLevel(tier, 'person')
    }
  }

  return tier
}

export function resolvePatrolTier(input: ResolvePatrolTierInput): PatrolTier {
  let tier = coalescePatrolTierSignals(input)

  if (input.surface === 'heatmap-dot' && input.verified === false && tier === 'identity') {
    tier = 'person'
  }

  return tier
}

export function resolvePatrolPersonStage(event: PatrolEvent): PatrolPersonStage {
  const tierEver = event.tierEver
  const tierSnap = event.tierSnapshot

  const tier = resolvePatrolTier({
    tierSnapshot: tierSnap,
    tier: normalizeTierInput(tierEver) ?? normalizeTierInput(event.stage),
    stage: event.stage,
    workerId: event.trackWorkerId ?? event.objectId,
    objectId: event.objectId,
    trackWorkerId: event.trackWorkerId,
    snapshotScore: event.snapshotScore,
    promotedFrom: event.promotedFrom,
    surface: 'event',
  })

  if (tier === 'identity') return 'profile'
  if (tier === 'person') return 'person'
  return 'object'
}

export function tierEverFromPersonRow(row: {
  status: string
  tierEver?: string | null
  tierSnapshot?: PatrolTierSnapshot | null
  snapshotScore?: number
}): PatrolTier {
  let tier: PatrolTier = 'object'

  const snapTier = normalizeTierInput(row.tierSnapshot?.tier)
  const ever = normalizeTierInput(row.tierEver)

  if (snapTier) tier = higherPatrolTierLevel(tier, snapTier)
  if (ever) tier = higherPatrolTierLevel(tier, ever)
  if (row.status === 'identified') tier = higherPatrolTierLevel(tier, 'identity')
  if ((row.snapshotScore ?? 0) >= PATROL_OBJECT_FACE_SNAPSHOT_SCORE) {
    tier = higherPatrolTierLevel(tier, 'person')
  }

  return tier
}

export { higherPatrolTierLevel as higherPatrolTier, PATROL_TIER_LEVEL_RANK as PATROL_TIER_RANK }
