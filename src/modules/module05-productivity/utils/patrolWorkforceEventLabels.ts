/**
 * Module 05 — nhãn sự kiện nhân lực theo vòng đời:
 *   Đối tượng (chưa đủ định danh) → Người (mã tạm ổn định, re-id) → Định danh (có Tên + Đơn vị)
 */
import type { PatrolEvent } from '../data/patrolMockData'
import type { ObjectState } from '../types/workforceHeatmap'
import { rememberPatrolSgcObjectLink } from '../services/patrolSgcObjectLink.service'
import { isPatrolManuallyIdentified } from '../services/patrolManualIdentity.service'
import { isVerifiedWorkerLabel } from './workforceHeatmapUi'

/** 3 giai đoạn nhận diện người — dùng cho tab panel sự kiện và KPI. */
export type PatrolPersonStage = 'object' | 'person' | 'profile'

export function isPatrolSgcWorkerId(id?: string | null): boolean {
  return Boolean(id && /^sgc-/i.test(id.trim()))
}

export function isPatrolObjectId(id?: string | null): boolean {
  return Boolean(id && /^obj-/i.test(id.trim()))
}

/**
 * Phân loại giai đoạn nhận diện của một sự kiện PERSON_DETECTED:
 * - profile: đã gán Tên + Đơn vị thủ công
 * - person:  có mã ổn định (OBJ-* hoặc sgc-*) — biết lại được nhưng chưa profile
 * - object:  chưa đủ tiêu chí — bán thân, quay lưng, track tạm
 */
export function resolvePatrolPersonStage(event: PatrolEvent): PatrolPersonStage {
  const objectId = event.objectId?.trim() ?? ''
  const trackWorkerId = event.trackWorkerId?.trim() ?? ''

  // Kiểm tra profile thủ công trên mọi alias
  if (objectId && isPatrolManuallyIdentified(objectId)) return 'profile'
  if (trackWorkerId && isPatrolManuallyIdentified(trackWorkerId)) return 'profile'

  // Kiểm tra đã verified label (gallery)
  if (isVerifiedWorkerLabel(event.objectLabel)
    && !isPatrolSgcWorkerId(event.objectLabel)
    && !isPatrolObjectId(event.objectLabel)) {
    return 'profile'
  }

  // OBJ-* = workforce engine đã re-id đủ tiêu chí (face/FULL_BODY/UPPER_BODY)
  if (isPatrolObjectId(objectId)) return 'person'

  // sgc-* = anonymous scan nhưng có mã ổn định
  if (isPatrolSgcWorkerId(objectId)) return 'person'
  if (isPatrolSgcWorkerId(trackWorkerId)) return 'person'

  return 'object'
}

/** Tiêu đề card theo giai đoạn. */
export function patrolWorkforceEventTitle(
  type: PatrolEvent['type'],
  objectId?: string | null,
  objectLabel?: string | null,
): string {
  if (type === 'IDENTITY_VERIFIED') return 'Định danh'
  if (type === 'PERSON_DETECTED') {
    if (isPatrolObjectId(objectId)) return 'Người'
    if (isPatrolSgcWorkerId(objectId)) return 'Người'
    if (isVerifiedWorkerLabel(objectLabel ?? '')
      && !isPatrolSgcWorkerId(objectLabel)
      && !isPatrolObjectId(objectLabel)) {
      return 'Người'
    }
    return 'Đối tượng'
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

/** Khóa unique để đếm entity (tab badge + KPI) — gộp sgc/OBJ cùng người. */
export function patrolEventEntityKey(event: PatrolEvent): string {
  const objectId = event.objectId?.trim() ?? ''
  const trackWorkerId = event.trackWorkerId?.trim() ?? ''

  if (isPatrolObjectId(objectId)) return objectId.toUpperCase()
  if (isPatrolSgcWorkerId(objectId)) return objectId.toUpperCase()
  if (isPatrolSgcWorkerId(trackWorkerId)) return trackWorkerId.toUpperCase()
  if (objectId) return objectId.toUpperCase()
  if (trackWorkerId) return trackWorkerId.toUpperCase()
  return event.id
}

export type PatrolEventsTabKey = 'all' | 'object' | 'person' | 'identity'

function hasPatrolSnapshot(event: PatrolEvent): boolean {
  return Boolean(event.snapshotUrl?.trim())
}

function matchesPatrolEventsTab(event: PatrolEvent, tab: PatrolEventsTabKey): boolean {
  if (!hasPatrolSnapshot(event)) return false
  if (tab === 'all') {
    return event.type === 'PERSON_DETECTED' || event.type === 'IDENTITY_VERIFIED'
  }
  if (tab === 'identity') {
    return event.type === 'IDENTITY_VERIFIED'
      || (event.type === 'PERSON_DETECTED' && resolvePatrolPersonStage(event) === 'profile')
  }
  if (event.type !== 'PERSON_DETECTED') return false
  return resolvePatrolPersonStage(event) === tab
}

/** Đếm unique entity theo tab — không đếm raw event rows. */
export function countUniquePatrolTabEntities(
  events: PatrolEvent[],
  tab: PatrolEventsTabKey,
): number {
  const keys = new Set<string>()
  for (const event of events) {
    if (!matchesPatrolEventsTab(event, tab)) continue
    keys.add(patrolEventEntityKey(event))
  }
  return keys.size
}

/** Mọi khóa alias có thể tra lịch sử (sgc + OBJ). */
export function patrolEventIdentityKeys(event: PatrolEvent): string[] {
  const keys = new Set<string>()
  if (event.objectId?.trim()) keys.add(event.objectId.trim())
  if (event.trackWorkerId?.trim()) keys.add(event.trackWorkerId.trim())
  return [...keys]
}
