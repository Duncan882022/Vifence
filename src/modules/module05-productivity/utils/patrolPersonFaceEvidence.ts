/**
 * Bằng chứng mặt trên thẻ Người — snapshot phải chứng minh AI nhận lại được.
 * Đồng bộ BE `person_snapshot_proves_reid` + tab Người KPI (≥1.05 + face).
 */
import type { PatrolEvent } from '../data/patrolTypes'
import type { PatrolTierSnapshot } from '../types/patrolTierSnapshot'
import { PATROL_OBJECT_FACE_SNAPSHOT_SCORE } from './patrolDayObjectFilter'

export function patrolPersonSnapshotProvesReId(input: {
  snapshotUrl?: string | null
  snapshotScore?: number | null
  tierSnapshot?: PatrolTierSnapshot | null
  tierEver?: string | null
  persId?: string | null
}): boolean {
  if (!input.snapshotUrl?.trim()) {
    return false
  }
  const score = input.snapshotScore ?? input.tierSnapshot?.snapshot_score ?? 0
  if (score < PATROL_OBJECT_FACE_SNAPSHOT_SCORE) {
    return false
  }
  if (input.tierSnapshot?.face_eligible) {
    return true
  }
  const tierEver = (input.tierEver ?? input.tierSnapshot?.tier ?? '').trim()
  if ((tierEver === 'person' || tierEver === 'identity') && input.persId?.trim()) {
    return true
  }
  return false
}

export function patrolEventSnapshotProvesReId(event: PatrolEvent): boolean {
  return patrolPersonSnapshotProvesReId({
    snapshotUrl: event.snapshotUrl,
    snapshotScore: event.snapshotScore,
    tierSnapshot: event.tierSnapshot,
    tierEver: event.tierEver,
    persId: event.objectId,
  })
}
