/**
 * Thống kê hiển thị Module 05 — gom KPI + heatmap overlay về cùng bộ đếm tab sự kiện.
 * `encountersStandard` giữ từ backend (lượt gặp tripwire, đơn vị khác entity).
 */
import type { PatrolDayStats } from '../services/patrolDayEvents.service'
import type { PatrolEvent } from '../data/patrolTypes'
import { computePatrolTabCounts } from './patrolEventsTabList'

export function derivePatrolDisplayStats(
  events: PatrolEvent[],
  backendStats: PatrolDayStats,
): PatrolDayStats {
  const tabs = computePatrolTabCounts(events)
  return {
    ...backendStats,
    workersStandard: tabs.all,
    personCount: tabs.person,
    identityCount: tabs.identity,
    objectCount: tabs.object,
  }
}
