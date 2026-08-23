/**
 * Module 05 — nhãn sự kiện nhân lực theo vòng đời:
 * scan (sgc) → định danh khuôn mặt (OBJ) → gán profile thủ công.
 */
import type { PatrolEvent } from '../data/patrolMockData'
import type { ObjectState } from '../types/workforceHeatmap'
import { rememberPatrolSgcObjectLink } from '../services/patrolSgcObjectLink.service'
import { isVerifiedWorkerLabel } from './workforceHeatmapUi'

export type PatrolWorkforceIdentityStage = 'scan' | 'identified' | 'profile'

export function isPatrolSgcWorkerId(id?: string | null): boolean {
  return Boolean(id && /^sgc-/i.test(id.trim()))
}

export function isPatrolObjectId(id?: string | null): boolean {
  return Boolean(id && /^obj-/i.test(id.trim()))
}

export function patrolWorkforceIdentityStage(
  objectId?: string | null,
  objectLabel?: string | null,
): PatrolWorkforceIdentityStage {
  const id = objectId?.trim() ?? ''
  const label = objectLabel?.trim() ?? ''
  if (isVerifiedWorkerLabel(label) && !isPatrolSgcWorkerId(label) && !isPatrolObjectId(label)) {
    return 'profile'
  }
  if (isPatrolObjectId(id)) return 'identified'
  if (isPatrolSgcWorkerId(id)) return 'scan'
  return 'scan'
}

/** Tiêu đề card — spec: Nhân lực (scan) / Định danh (OBJ). */
export function patrolWorkforceEventTitle(
  type: PatrolEvent['type'],
  objectId?: string | null,
  objectLabel?: string | null,
): string {
  if (type === 'IDENTITY_VERIFIED') return 'Định danh'
  if (type === 'PERSON_DETECTED') {
    const stage = patrolWorkforceIdentityStage(objectId, objectLabel)
    if (stage === 'identified') return 'Định danh'
    return 'Nhân lực'
  }
  return ''
}

/** Dòng phụ — hiển thị workerId (sgc) hoặc objectId (OBJ). */
export function patrolWorkforceEventSubjectId(
  objectId?: string | null,
  trackWorkerId?: string | null,
): string {
  const primary = objectId?.trim() ?? ''
  if (isPatrolObjectId(primary)) return primary
  if (isPatrolSgcWorkerId(primary)) return primary
  const track = trackWorkerId?.trim()
  if (track) return track
  return primary || '—'
}

export function formatPatrolPersonDetectedEvent(event: PatrolEvent): PatrolEvent {
  if (event.type !== 'PERSON_DETECTED') return event

  const trackWorkerId = event.trackWorkerId
    ?? (isPatrolSgcWorkerId(event.objectId) ? event.objectId : undefined)
  const title = patrolWorkforceEventTitle(event.type, event.objectId, event.objectLabel)
  const subjectId = patrolWorkforceEventSubjectId(event.objectId, trackWorkerId)

  return {
    ...event,
    trackWorkerId,
    violationLabel: title,
    objectLabel: subjectId,
  }
}

export function buildSgcToObjectIdMap(objects: ObjectState[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const obj of objects) {
    const wid = obj.worker_id?.trim()
    if (!wid || !isPatrolSgcWorkerId(wid)) continue
    map.set(wid.toUpperCase(), obj.object_id)
  }
  return map
}

const FACE_CAPTURE_MODES = new Set(['FACE_CLOSEUP', 'FULL_BODY', 'UPPER_BODY'])

/** Gắn objectId khi workforce đã có khuôn mặt / thân đủ tiêu chí. */
export function enrichPatrolPersonEventWithWorkforceObject(
  event: PatrolEvent,
  objects: ObjectState[],
  sgcToObject: Map<string, string>,
): PatrolEvent {
  if (event.type !== 'PERSON_DETECTED') return event

  const sgcKey = (event.trackWorkerId ?? event.objectId)?.trim()
  const sgcUpper = sgcKey?.toUpperCase()
  let objectId = sgcUpper ? sgcToObject.get(sgcUpper) : undefined

  if (!objectId && sgcKey) {
    const match = objects.find(o =>
      o.helmet_id === event.cameraId
      && o.worker_id?.trim().toUpperCase() === sgcUpper
      && FACE_CAPTURE_MODES.has(o.observation_mode),
    )
    objectId = match?.object_id
  }

  if (!objectId || !isPatrolObjectId(objectId)) {
    return formatPatrolPersonDetectedEvent(event)
  }

  const trackWorkerId = isPatrolSgcWorkerId(sgcKey) ? sgcKey : event.trackWorkerId
  if (trackWorkerId && isPatrolSgcWorkerId(trackWorkerId)) {
    rememberPatrolSgcObjectLink(trackWorkerId, objectId)
  }

  const enriched: PatrolEvent = {
    ...event,
    objectId,
    trackWorkerId,
  }
  return formatPatrolPersonDetectedEvent(enriched)
}

export function enrichPatrolEventsWithWorkforceObjects(
  events: PatrolEvent[],
  objects: ObjectState[],
): PatrolEvent[] {
  if (!objects.length) {
    return events.map(ev =>
      ev.type === 'PERSON_DETECTED' ? formatPatrolPersonDetectedEvent(ev) : ev,
    )
  }
  const sgcToObject = buildSgcToObjectIdMap(objects)
  return events.map(ev => enrichPatrolPersonEventWithWorkforceObject(ev, objects, sgcToObject))
}

/** Mọi khóa alias có thể tra lịch sử (sgc + OBJ). */
export function patrolEventIdentityKeys(event: PatrolEvent): string[] {
  const keys = new Set<string>()
  if (event.objectId?.trim()) keys.add(event.objectId.trim())
  if (event.trackWorkerId?.trim()) keys.add(event.trackWorkerId.trim())
  return [...keys]
}
