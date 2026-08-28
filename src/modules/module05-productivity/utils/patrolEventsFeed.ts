/**
 * Module 05 — feed sự kiện: chỉ bản có snapshot + thời gian hợp lệ (evidence).
 */
import type { PatrolEvent } from '../data/patrolTypes'

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
