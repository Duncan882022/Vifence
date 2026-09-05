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

export function resolvePatrolTier(input: ResolvePatrolTierInput): PatrolTier {
  const snap = input.tierSnapshot
  if (snap?.tier) {
    let tier = snap.tier
    if (input.surface === 'heatmap-dot' && input.verified === false && tier === 'identity') {
      tier = 'person'
    }
    return tier
  }

  const fromTier =
    normalizeTierInput(input.tier)
    ?? normalizeTierInput(input.stage)
    ?? null

  if (fromTier === 'identity') return 'identity'
  if (fromTier === 'person') return 'person'
  if (fromTier === 'object') return 'object'

  const inferred = inferTierFromIds(input)
  if (inferred === 'identity') return 'identity'
  if (inferred === 'person') return 'person'
  return 'object'
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
  const snapTier = row.tierSnapshot?.tier
  if (snapTier) return snapTier
  const ever = normalizeTierInput(row.tierEver)
  if (ever) return ever
  if (row.status === 'identified') return 'identity'
  if ((row.snapshotScore ?? 0) >= PATROL_OBJECT_FACE_SNAPSHOT_SCORE) return 'person'
  return 'object'
}

export { higherPatrolTierLevel as higherPatrolTier, PATROL_TIER_LEVEL_RANK as PATROL_TIER_RANK }
