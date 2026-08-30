import type { PatrolEvent } from '../data/patrolTypes'
import type { ObjectState } from '../types/workforceHeatmap'
import {
  getPatrolManualIdentity,
  getPatrolManualIdentityForPatrolEvent,
  resolvePatrolObjectLabel,
  resolvePatrolObjectUnit,
  resolvePatrolWorkerId,
} from '../services/patrolManualIdentity.service'
import {
  isPatrolObjectId,
  isPatrolPersId,
  isPatrolSgcWorkerId,
  patrolEventIdentityKeys,
  resolvePatrolPersonStage,
  type PatrolPersonStage,
} from './patrolWorkforceEventLabels'

function findManualIdentityForEvent(event: PatrolEvent) {
  return getPatrolManualIdentityForPatrolEvent(event)
}

function resolvePatrolTechnicalObjectId(event: PatrolEvent): string {
  const fromDayCard = event.id.match(/^(?:pers|obj):(.+)$/i)?.[1]?.trim()
  if (fromDayCard) return fromDayCard
  const objectId = event.objectId?.trim() ?? ''
  if (isPatrolPersId(objectId) || isPatrolObjectId(objectId)) return objectId
  return objectId
}

export function applyManualIdentityToPatrolEvent(event: PatrolEvent): PatrolEvent {
  const manual = findManualIdentityForEvent(event)
  if (!manual) return event
  const unitSuffix = manual.unitName ? ` · ${manual.unitName}` : ''
  const technicalObjectId = resolvePatrolTechnicalObjectId(event)
  const preserveTechnicalId = Boolean(
    event.id.match(/^(?:pers|obj):/i)
    || isPatrolPersId(technicalObjectId)
    || isPatrolObjectId(technicalObjectId),
  )
  return {
    ...event,
    objectId: preserveTechnicalId ? technicalObjectId : manual.workerId,
    trackWorkerId: isPatrolSgcWorkerId(event.trackWorkerId) ? event.trackWorkerId : undefined,
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

/** Card list — nhãn chính cạnh icon + meta cho modal chi tiết. */
export function resolvePatrolPersonCardDisplay(event: PatrolEvent): {
  /** Dòng chính cạnh icon người trên card list. */
  subjectLabel: string
  title: string
  subtitle: string
  unit: string | null
  workerId: string | null
  stage: PatrolPersonStage
} {
  const stage = resolvePatrolPersonStage(event)
  const display = resolveEventObjectDisplay(event)

  if (stage === 'profile') {
    return {
      subjectLabel: display.label,
      title: display.label,
      subtitle: display.workerId ? `Mã: ${display.workerId}` : '—',
      unit: display.unit,
      workerId: display.workerId,
      stage,
    }
  }

  if (stage === 'person') {
    const sgc = [event.trackWorkerId, event.objectId]
      .map(v => v?.trim() ?? '')
      .find(v => isPatrolSgcWorkerId(v))
    const persId = [event.trackWorkerId, event.objectId]
      .map(v => v?.trim() ?? '')
      .find(v => isPatrolPersId(v))
    const code = sgc ? sgc.toUpperCase() : (persId ?? display.workerId ?? '')
    return {
      subjectLabel: code || '—',
      title: code || 'Người',
      subtitle: code ? `Mã: ${code}` : 'Chưa có trong gallery',
      unit: null,
      workerId: code || null,
      stage,
    }
  }

  return {
    subjectLabel: 'Unknown',
    title: 'Unknown',
    subtitle: isPatrolObjectId(event.objectId ?? '') ? 'Đang quan sát' : '—',
    unit: null,
    workerId: display.workerId,
    stage,
  }
}
