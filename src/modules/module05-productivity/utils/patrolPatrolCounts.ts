/**
 * Đếm entity patrol theo tier — dùng chung KPI, tooltip mũ, heatmap gate.
 */
import type { PatrolEvent } from '../data/patrolMockData'
import {
  countUniquePatrolTabEntities,
  isPatrolSgcWorkerId,
  patrolEventMasterEntityKey,
  resolvePatrolPersonStage,
  type PatrolEventsTabKey,
} from './patrolWorkforceEventLabels'
import { isPatrolGalleryWorkerId } from './patrolIdentityEntity'
import { isPatrolManuallyIdentified } from '../services/patrolManualIdentity.service'
import { getHeatmapInFrameMasterIds, getHeatmapSessionMasterIds } from '@/services/patrolHeatmapPersonRegistry'

export function isPatrolHeatmapEligibleId(rawId?: string | null): boolean {
  const id = rawId?.trim() ?? ''
  if (!id) return false
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

export function countPatrolDetectedByCamera(
  events: PatrolEvent[],
  cameraId?: string,
): { person: number; identity: number; total: number } {
  const scoped = cameraId
    ? events.filter(e => e.cameraId === cameraId)
    : events
  const person = countUniquePatrolTabEntities(scoped, 'person')
  const identity = countUniquePatrolTabEntities(scoped, 'identity')
  return { person, identity, total: person + identity }
}

/** KPI Cảnh báo — unique Người + Định danh (không Đối tượng). */
export function countPatrolAlertEntities(events: PatrolEvent[]): number {
  return countPatrolDetectedByCamera(events).total
}

/** Master keys Người + Định danh từ events (không cần snapshot — dùng KPI). */
export function collectPatrolWorkerMasterIds(events: PatrolEvent[]): Set<string> {
  const keys = new Set<string>()
  for (const event of events) {
    if (event.type !== 'PERSON_DETECTED' && event.type !== 'IDENTITY_VERIFIED') continue
    const stage = resolvePatrolPersonStage(event)
    if (stage !== 'person' && stage !== 'profile') continue
    keys.add(patrolEventMasterEntityKey(event))
  }
  return keys
}

/**
 * KPI Công nhân global — dedupe Người + Định danh, gộp mọi mũ HC-*.
 * Union events + dot pin ca hiện tại (registry); không dùng YOLO personCount.
 */
export function countPatrolGlobalWorkers(
  events: PatrolEvent[],
  opts?: { liveOnly?: boolean },
): number {
  if (opts?.liveOnly) {
    return new Set(getHeatmapInFrameMasterIds()).size
  }
  const keys = collectPatrolWorkerMasterIds(events)
  for (const masterId of getHeatmapSessionMasterIds()) {
    keys.add(masterId)
  }
  return keys.size
}

export function summarizePatrolGlobalWorkers(
  events: PatrolEvent[],
  opts?: { liveOnly?: boolean },
): {
  total: number
  person: number
  identity: number
  fromPins: number
} {
  const person = countUniquePatrolTabEntities(events, 'person')
  const identity = countUniquePatrolTabEntities(events, 'identity')
  const fromPins = opts?.liveOnly
    ? getHeatmapInFrameMasterIds().length
    : getHeatmapSessionMasterIds().length
  return {
    total: countPatrolGlobalWorkers(events, opts),
    person,
    identity,
    fromPins,
  }
}

export function summarizePatrolAlertCount(events: PatrolEvent[]): string {
  const { person, identity, total } = countPatrolDetectedByCamera(events)
  if (total === 0) return 'Chưa có sự kiện'
  if (identity === 0) return `${total} người (${person} Người)`
  if (person === 0) return `${total} người (${identity} Định danh)`
  return `${total} người (${person} Người · ${identity} Định danh)`
}

export type PatrolDetectedTabKey = Extract<PatrolEventsTabKey, 'person' | 'identity'>
