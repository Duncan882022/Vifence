/**
 * Đếm entity patrol theo tier — dùng chung KPI, tooltip mũ, heatmap gate.
 */
import type { PatrolEvent } from '../data/patrolMockData'
import {
  countUniquePatrolTabEntities,
  isPatrolSgcWorkerId,
  resolvePatrolPersonStage,
  type PatrolEventsTabKey,
} from './patrolWorkforceEventLabels'
import { isPatrolGalleryWorkerId } from './patrolIdentityEntity'
import { isPatrolManuallyIdentified } from '../services/patrolManualIdentity.service'

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

export function summarizePatrolAlertCount(events: PatrolEvent[]): string {
  const { person, identity, total } = countPatrolDetectedByCamera(events)
  if (total === 0) return 'Chưa có sự kiện'
  if (identity === 0) return `${total} người (${person} Người)`
  if (person === 0) return `${total} người (${identity} Định danh)`
  return `${total} người (${person} Người · ${identity} Định danh)`
}

export function patrolRoiLabelFromParts(input: {
  workerId?: string | null
  workerName?: string | null
  objectId?: string | null
  manualName?: string | null
}): string {
  const manual = input.manualName?.trim()
  if (manual) return manual
  const wid = input.workerId?.trim() ?? ''
  const wname = input.workerName?.trim() ?? ''
  if (isPatrolGalleryWorkerId(wid) || isPatrolManuallyIdentified(wid)) {
    return wname || wid
  }
  if (isPatrolSgcWorkerId(wid)) return wid
  const oid = input.objectId?.trim() ?? ''
  if (/^OBJ-/i.test(oid)) return oid
  return 'Đối tượng'
}

export type PatrolDetectedTabKey = Extract<PatrolEventsTabKey, 'person' | 'identity'>
