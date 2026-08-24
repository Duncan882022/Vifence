/**
 * Module 05 — feed sự kiện: chỉ bản có snapshot + thời gian hợp lệ (evidence).
 */
import type { PatrolEvent } from '../data/patrolMockData'
import {
  isPatrolHeatmapEligibleEvent,
  summarizePatrolAlertCount,
} from './patrolPatrolCounts'
import { PATROL_PPE_UI_HIDDEN } from './patrolPpeVisibility'

const MAX_EVENT_AGE_MS = 90 * 24 * 60 * 60 * 1000

export function normalizeUnixSeconds(ts: number | undefined | null): number | null {
  if (ts == null || !Number.isFinite(ts) || ts <= 0) return null
  let sec = ts
  if (sec > 1e12) sec = sec / 1000
  if (sec < 1_000_000_000) return null
  return sec
}

export function unixSecondsToIso(ts: number | undefined | null): string | null {
  const sec = normalizeUnixSeconds(ts)
  if (sec == null) return null
  return new Date(sec * 1000).toISOString()
}

export function hasPatrolEventSnapshot(event: PatrolEvent): boolean {
  return Boolean(event.snapshotUrl?.trim())
}

export function isValidPatrolEventTime(iso: string): boolean {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return false
  const delta = Date.now() - t
  if (delta < -60_000) return false
  if (delta > MAX_EVENT_AGE_MS) return false
  return true
}

/** Sự kiện vòng đời người (3 tab) — bắt buộc có snapshot evidence. */
export function isPatrolPersonLifecycleWithSnapshot(event: PatrolEvent): boolean {
  if (event.type !== 'PERSON_DETECTED' && event.type !== 'IDENTITY_VERIFIED') return false
  return hasPatrolEventSnapshot(event)
}

/** Loại sự kiện được phép trên feed chính (spec §8.1 / §8.4). */
export function isPatrolFeedEventType(event: PatrolEvent): boolean {
  if (event.type === 'PERSON_DETECTED' || event.type === 'IDENTITY_VERIFIED') {
    return hasPatrolEventSnapshot(event)
  }
  if (event.type === 'PPE_VIOLATION') return !PATROL_PPE_UI_HIDDEN && hasPatrolEventSnapshot(event)
  return false
}

export function isPatrolEvidenceEvent(event: PatrolEvent): boolean {
  if (!isPatrolFeedEventType(event)) return false
  if (!isValidPatrolEventTime(event.lockedAt)) return false
  return hasPatrolEventSnapshot(event)
}

export function filterPatrolEvidenceEvents(events: PatrolEvent[]): PatrolEvent[] {
  return events.filter(isPatrolEvidenceEvent)
}

/** KPI Cảnh báo — unique entities Người + Định danh (có snapshot). */
export function summarizePatrolAlertEvents(events: PatrolEvent[]): string {
  const eligible = events.filter(
    e => isPatrolPersonLifecycleWithSnapshot(e) && isPatrolHeatmapEligibleEvent(e),
  )
  return summarizePatrolAlertCount(eligible)
}
