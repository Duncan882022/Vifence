import type { PatrolEvent } from '../data/patrolMockData'
import type { ObjectState } from '../types/workforceHeatmap'
import {
  getPatrolManualIdentity,
  resolvePatrolObjectLabel,
  resolvePatrolObjectUnit,
  resolvePatrolWorkerId,
} from '../services/patrolManualIdentity.service'
import { patrolEventIdentityKeys } from './patrolWorkforceEventLabels'

function findManualIdentityForEvent(event: PatrolEvent) {
  for (const key of patrolEventIdentityKeys(event)) {
    const manual = getPatrolManualIdentity(key)
    if (manual) return manual
  }
  return getPatrolManualIdentity(event.id)
}

export function applyManualIdentityToPatrolEvent(event: PatrolEvent): PatrolEvent {
  const manual = findManualIdentityForEvent(event)
  if (!manual) return event
  const unitSuffix = manual.unitName ? ` · ${manual.unitName}` : ''
  return {
    ...event,
    objectId: manual.workerId,
    trackWorkerId: undefined,
    objectLabel: `${manual.workerName}${unitSuffix}`,
    violationLabel: event.type === 'PERSON_DETECTED' || event.type === 'IDENTITY_VERIFIED'
      ? manual.workerName
      : event.violationLabel,
  }
}

export function applyManualIdentityToPatrolEvents(events: PatrolEvent[]): PatrolEvent[] {
  return events.map(applyManualIdentityToPatrolEvent)
}

export function applyManualIdentityToObject(object: ObjectState): ObjectState {
  const manual = getPatrolManualIdentity(object.object_id)
  if (!manual) return object
  return {
    ...object,
    worker_id: manual.workerId,
    worker_name: manual.workerName,
    identity_status: 'VERIFIED',
  }
}

export function manualIdentityDisplayForObject(object: ObjectState): {
  title: string
  subtitle: string
  unit: string | null
  workerId: string | null
} {
  const manual = getPatrolManualIdentity(object.object_id)
  if (manual) {
    return {
      title: manual.workerName,
      subtitle: `Mã: ${manual.workerId} · Đã định danh thủ công`,
      unit: manual.unitName,
      workerId: manual.workerId,
    }
  }
  const verified = object.identity_status === 'VERIFIED'
  const workerId = resolvePatrolWorkerId(object.object_id, object.worker_id)
  return {
    title: verified
      ? (object.worker_name || object.worker_id || object.object_id)
      : object.object_id,
    subtitle: verified
      ? `Mã: ${workerId || object.worker_id || object.object_id}`
      : 'Đang quan sát · chưa định danh',
    unit: resolvePatrolObjectUnit(object.object_id),
    workerId,
  }
}

export function resolveEventObjectDisplay(event: PatrolEvent): {
  label: string
  unit: string | null
  workerId: string | null
} {
  const manual = findManualIdentityForEvent(event)
  const keys = patrolEventIdentityKeys(event)
  const primaryKey = keys[0] ?? event.id
  return {
    label: manual
      ? manual.workerName
      : resolvePatrolObjectLabel(primaryKey, event.objectLabel),
    unit: manual?.unitName ?? resolvePatrolObjectUnit(primaryKey),
    workerId: manual?.workerId ?? resolvePatrolWorkerId(primaryKey, event.objectId),
  }
}
