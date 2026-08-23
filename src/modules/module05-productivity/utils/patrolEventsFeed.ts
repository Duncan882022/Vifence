/**
 * Module 05 — feed sự kiện: chỉ bản có snapshot + thời gian hợp lệ (evidence).
 */
import type { PatrolEvent } from '../data/patrolMockData'
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

/** Loại sự kiện được phép trên feed chính (spec §8.1 / §8.4). */
export function isPatrolFeedEventType(event: PatrolEvent): boolean {
  if (event.type === 'PERSON_DETECTED') {
    return hasPatrolEventSnapshot(event)
  }
  if (event.type === 'PPE_VIOLATION') return !PATROL_PPE_UI_HIDDEN
  return [
    'POPULATION_OBSERVED',
    'POPULATION_CHANGE',
    'HIGH_DENSITY',
    'IDENTITY_VERIFIED',
    'MACHINE_STOPPED',
  ].includes(event.type)
}

const WORKFORCE_FEED_TYPES = new Set<PatrolEvent['type']>([
  'POPULATION_OBSERVED',
  'POPULATION_CHANGE',
  'HIGH_DENSITY',
  'IDENTITY_VERIFIED',
  'MACHINE_STOPPED',
])

export function isPatrolEvidenceEvent(event: PatrolEvent): boolean {
  if (!isPatrolFeedEventType(event)) return false
  if (!isValidPatrolEventTime(event.lockedAt)) return false
  if (WORKFORCE_FEED_TYPES.has(event.type)) return true
  return hasPatrolEventSnapshot(event)
}

export function filterPatrolEvidenceEvents(events: PatrolEvent[]): PatrolEvent[] {
  return events.filter(isPatrolEvidenceEvent)
}

/** KPI Cảnh báo — cùng tập sự kiện với panel Sự kiện. */
export function summarizePatrolAlertEvents(events: PatrolEvent[]): string {
  if (events.length === 0) return 'Chưa có sự kiện'
  const workforce = events.filter(e =>
    ['POPULATION_OBSERVED', 'POPULATION_CHANGE', 'HIGH_DENSITY'].includes(e.type),
  ).length
  const identity = events.filter(e => e.type === 'IDENTITY_VERIFIED').length
  const machine = events.filter(e => e.type === 'MACHINE_STOPPED').length
  const withSnapshot = events.filter(e => hasPatrolEventSnapshot(e)).length
  const parts: string[] = []
  if (workforce > 0) parts.push(`${workforce} nhân lực`)
  if (identity > 0) parts.push(`${identity} định danh`)
  if (machine > 0) parts.push(`${machine} máy`)
  if (withSnapshot > 0 && parts.length === 0) parts.push(`${withSnapshot} có ảnh`)
  return parts.length > 0 ? parts.join(' · ') : `${events.length} sự kiện`
}
