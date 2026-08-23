import type { PatrolEvent } from '../data/patrolMockData'
import type { ObjectState } from '../types/workforceHeatmap'
import {
  getPatrolManualIdentity,
  resolvePatrolObjectLabel,
  resolvePatrolObjectUnit,
} from '../services/patrolManualIdentity.service'

export function applyManualIdentityToPatrolEvent(event: PatrolEvent): PatrolEvent {
  const key = event.objectId?.trim() || event.id
  const manual = getPatrolManualIdentity(key)
  if (!manual) return event
  const unitSuffix = manual.unitName ? ` · ${manual.unitName}` : ''
  return {
    ...event,
    objectLabel: `${manual.workerName}${unitSuffix}`,
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
    worker_name: manual.workerName,
    identity_status: 'VERIFIED',
  }
}

export function manualIdentityDisplayForObject(object: ObjectState): {
  title: string
  subtitle: string
  unit: string | null
} {
  const manual = getPatrolManualIdentity(object.object_id)
  if (manual) {
    return {
      title: manual.workerName,
      subtitle: 'Đã định danh thủ công',
      unit: manual.unitName,
    }
  }
  const verified = object.identity_status === 'VERIFIED'
  return {
    title: verified
      ? (object.worker_name || object.worker_id || object.object_id)
      : object.object_id,
    subtitle: verified ? `Worker ID: ${object.worker_id}` : 'Đang quan sát · chưa định danh',
    unit: resolvePatrolObjectUnit(object.object_id),
  }
}

export function resolveEventObjectDisplay(event: PatrolEvent): {
  label: string
  unit: string | null
} {
  const key = event.objectId?.trim() || event.id
  return {
    label: resolvePatrolObjectLabel(key, event.objectLabel),
    unit: resolvePatrolObjectUnit(key),
  }
}
