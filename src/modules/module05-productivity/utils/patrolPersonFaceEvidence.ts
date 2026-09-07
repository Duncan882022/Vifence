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
}): boolean {
  if (!input.snapshotUrl?.trim()) {
    return false
  }
  const score = input.snapshotScore ?? input.tierSnapshot?.snapshot_score ?? 0
  if (score < PATROL_OBJECT_FACE_SNAPSHOT_SCORE) {
    return false
  }
  return Boolean(input.tierSnapshot?.face_eligible)
}

export function patrolEventSnapshotProvesReId(event: PatrolEvent): boolean {
  return patrolPersonSnapshotProvesReId({
    snapshotUrl: event.snapshotUrl,
    snapshotScore: event.snapshotScore,
    tierSnapshot: event.tierSnapshot,
  })
}
