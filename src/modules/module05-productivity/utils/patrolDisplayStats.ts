/**
 * Thống kê hiển thị Module 05 — KPI Tier1 từ SQLite; tab badge từ listing.
 *
 * KPI headcount / lượt gặp: chỉ `day_stats` backend.
 * Tab badge: `computePatrolTabCounts` — dedupe cho listing, không ảnh hưởng KPI.
 */
import type { PatrolDayStats } from '../services/patrolDayEvents.service'
import type { PatrolEvent } from '../data/patrolTypes'
import { computePatrolTabCounts, type PatrolTabCounts } from './patrolEventsTabList'

export interface PatrolDisplayBundle {
  stats: PatrolDayStats
  tabCounts: PatrolTabCounts
}

export function derivePatrolDisplayStats(
  events: PatrolEvent[],
  backendStats: PatrolDayStats,
): PatrolDisplayBundle {
  const tabCounts = computePatrolTabCounts(events)
  const headcount = backendStats.personCount + backendStats.identityCount

  return {
    stats: {
      ...backendStats,
      workersStandard: headcount,
      objectCount: backendStats.objectCount,
      objectEncounterCount: backendStats.unassignedObservations,
    },
    tabCounts,
  }
}
