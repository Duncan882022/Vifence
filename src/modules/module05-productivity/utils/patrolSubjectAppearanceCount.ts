import type { PatrolEvent } from '../data/patrolTypes'
import type { PatrolDayPresence } from '../services/patrolDayEvents.service'
import { resolvePatrolAppearanceSubjectId } from './patrolWorkforceEventLabels'

/** Đếm lượt xuất hiện (presence) theo subject_id — đồng bộ modal Lịch sử xuất hiện. */
export function buildPatrolSubjectAppearanceCountLookup(
  presences: PatrolDayPresence[],
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const presence of presences) {
    const subjectId = presence.subjectId.trim()
    if (!subjectId) continue
    counts.set(subjectId, (counts.get(subjectId) ?? 0) + 1)
  }
  return counts
}

export function resolvePatrolEventAppearanceHistoryCount(
  event: PatrolEvent,
  lookup: Map<string, number>,
): number {
  if (lookup.size === 0) return 0
  const subjectId = resolvePatrolAppearanceSubjectId(event).trim()
  if (!subjectId) return 0
  return lookup.get(subjectId) ?? 0
}
