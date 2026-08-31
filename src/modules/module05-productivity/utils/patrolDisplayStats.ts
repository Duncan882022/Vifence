/**
 * Thống kê hiển thị Module 05 — KPI Tier1.
 *
 * - Nhân sự: đếm thẳng từ SQLite (person + identity), không dedupe tab.
 * - Lượt gặp Đối tượng: unassigned_observations (appearances obj-*).
 * - Tab badge / listing: computePatrolTabCounts(events) riêng.
 */
import type { PatrolDayStats } from '../services/patrolDayEvents.service'
import type { PatrolEvent } from '../data/patrolTypes'
import { computePatrolTabCounts } from './patrolEventsTabList'

export function derivePatrolDisplayStats(
  events: PatrolEvent[],
  backendStats: PatrolDayStats,
): PatrolDayStats {
  const tabs = computePatrolTabCounts(events)
  const workersStandard = backendStats.personCount + backendStats.identityCount
  return {
    ...backendStats,
    workersStandard: workersStandard > 0 ? workersStandard : tabs.all,
    personCount: backendStats.personCount,
    identityCount: backendStats.identityCount,
    objectCount: tabs.object,
    objectEncounterCount: backendStats.unassignedObservations,
  }
}
