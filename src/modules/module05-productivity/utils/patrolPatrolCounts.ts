/**
 * Đếm entity patrol theo tier — dùng chung KPI, tooltip mũ, heatmap gate.
 * Nguồn sự thật: thẻ SQLite trong ngày (pers-* / iden-*), không union registry sgc-*.
 */
import type { PatrolEvent } from '../data/patrolTypes'
import {
  countUniquePatrolTabEntities,
  isPatrolIdenId,
  isPatrolPersId,
  isPatrolSgcWorkerId,
  patrolEventMasterEntityKey,
  resolvePatrolPersonStage,
  type PatrolEventsTabKey,
} from './patrolWorkforceEventLabels'
import { isPatrolGalleryWorkerId } from './patrolIdentityEntity'
import { isPatrolManuallyIdentified } from '../services/patrolManualIdentity.service'
import { filterRecentPatrolWorkerEvents } from './patrolDayHeatmapDots'

export function isPatrolHeatmapEligibleId(rawId?: string | null): boolean {
  const id = rawId?.trim() ?? ''
  if (!id) return false
  if (isPatrolPersId(id)) return true
  if (isPatrolIdenId(id)) return true
  if (isPatrolSgcWorkerId(id)) return true
  if (isPatrolGalleryWorkerId(id)) return true
  if (isPatrolManuallyIdentified(id)) return true
  return false
}

export function isPatrolHeatmapEligibleEvent(event: PatrolEvent): boolean {
  if (event.type !== 'PERSON_DETECTED' && event.type !== 'IDENTITY_VERIFIED') return false
  const stage = resolvePatrolPersonStage(event)
  return stage === 'person' || stage === 'profile'
}

function scopePatrolWorkerEvents(
  events: PatrolEvent[],
  opts?: { liveOnly?: boolean },
): PatrolEvent[] {
  return opts?.liveOnly ? filterRecentPatrolWorkerEvents(events) : events
}

export function countPatrolDetectedByCamera(
  events: PatrolEvent[],
  cameraId?: string,
  opts?: { liveOnly?: boolean },
): { person: number; identity: number; total: number } {
  const scoped = scopePatrolWorkerEvents(
    cameraId ? events.filter(e => e.cameraId === cameraId) : events,
    opts,
  )
  const person = countUniquePatrolTabEntities(scoped, 'person')
  const identity = countUniquePatrolTabEntities(scoped, 'identity')
  return { person, identity, total: person + identity }
}

/** KPI Cảnh báo — unique Người + Định danh (không Đối tượng). */
export function countPatrolAlertEntities(events: PatrolEvent[]): number {
  return countPatrolDetectedByCamera(events).total
}

/** Master keys Người + Định danh từ events (không cần snapshot — dùng KPI). */
export function collectPatrolWorkerMasterIds(
  events: PatrolEvent[],
  opts?: { liveOnly?: boolean },
): Set<string> {
  const keys = new Set<string>()
  for (const event of scopePatrolWorkerEvents(events, opts)) {
    if (event.type !== 'PERSON_DETECTED' && event.type !== 'IDENTITY_VERIFIED') continue
    const stage = resolvePatrolPersonStage(event)
    if (stage !== 'person' && stage !== 'profile') continue
    keys.add(patrolEventMasterEntityKey(event))
  }
  return keys
}

/**
 * KPI Công nhân — dedupe Người + Định danh từ SQLite day events.
 * liveOnly: chỉ người có lastSeen trong ~2 phút gần nhất.
 */
export function countPatrolGlobalWorkers(
  events: PatrolEvent[],
  opts?: { liveOnly?: boolean },
): number {
  return collectPatrolWorkerMasterIds(events, opts).size
}

export function summarizePatrolGlobalWorkers(
  events: PatrolEvent[],
  opts?: { liveOnly?: boolean },
): {
  total: number
  person: number
  identity: number
} {
  const scoped = scopePatrolWorkerEvents(events, opts)
  return {
    total: collectPatrolWorkerMasterIds(events, opts).size,
    person: countUniquePatrolTabEntities(scoped, 'person'),
    identity: countUniquePatrolTabEntities(scoped, 'identity'),
  }
}

export function summarizePatrolAlertCount(events: PatrolEvent[]): string {
  const { person, identity, total } = countPatrolDetectedByCamera(events)
  if (total === 0) return 'Chưa có sự kiện'
  if (identity === 0) return `${total} người (${person} Nhân sự)`
  if (person === 0) return `${total} người (${identity} Định danh)`
  return `${total} người (${person} Nhân sự · ${identity} Định danh)`
}

export type PatrolDetectedTabKey = Extract<PatrolEventsTabKey, 'person' | 'identity'>
