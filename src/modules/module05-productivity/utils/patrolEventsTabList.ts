/**
 * Danh sách sự kiện theo tab — một nguồn cho badge tab và phân trang panel.
 * Chỉ entity có snapshot evidence; dedupe theo master key sau khi lọc.
 */
import type { PatrolEvent } from '../data/patrolTypes'
import { hasPatrolEventSnapshot, isPatrolPersonLifecycleEvent } from './patrolEventsFeed'
import {
  dedupePatrolEventsByMasterEntity,
  resolvePatrolPersonStage,
  type PatrolEventsTabKey,
} from './patrolWorkforceEventLabels'

function matchesPatrolEventsTab(event: PatrolEvent, tab: PatrolEventsTabKey): boolean {
  if (!isPatrolPersonLifecycleEvent(event)) return false
  if (!hasPatrolEventSnapshot(event)) return false
  if (tab === 'all') {
    return event.type === 'PERSON_DETECTED' || event.type === 'IDENTITY_VERIFIED'
  }
  if (tab === 'identity') {
    return event.type === 'PERSON_DETECTED' && resolvePatrolPersonStage(event) === 'profile'
  }
  if (event.type !== 'PERSON_DETECTED') return false
  return resolvePatrolPersonStage(event) === tab
}

/** Card hiển thị + đếm tab — lọc trước, dedupe sau (giữ snapshot mới nhất / entity). */
export function listPatrolEventsForTab(
  events: PatrolEvent[],
  tab: PatrolEventsTabKey,
): PatrolEvent[] {
  const matched = events.filter(e => matchesPatrolEventsTab(e, tab))
  return dedupePatrolEventsByMasterEntity(matched)
}

/** @deprecated Dùng {@link listPatrolEventsForTab}(events, tab).length */
export function countUniquePatrolTabEntities(
  events: PatrolEvent[],
  tab: PatrolEventsTabKey,
): number {
  return listPatrolEventsForTab(events, tab).length
}
