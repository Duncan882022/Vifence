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

  // Tab Người = có mã sgc ổn định. OBJ-only / mặt chưa đủ → Đối tượng.
  if (isPatrolSgcWorkerId(objectId)) return 'person'
  if (isPatrolSgcWorkerId(trackWorkerId)) return 'person'

  return 'object'
}

/** Tiêu đề card theo giai đoạn. */
export function patrolWorkforceEventTitle(
  type: PatrolEvent['type'],
  objectId?: string | null,
  objectLabel?: string | null,
  trackWorkerId?: string | null,
): string {
  if (type === 'IDENTITY_VERIFIED') return 'Định danh'
  if (type === 'PERSON_DETECTED') {
    if (isPatrolSgcWorkerId(objectId)) return 'Người'
    if (isPatrolSgcWorkerId(trackWorkerId)) return 'Người'
    if (isVerifiedWorkerLabel(objectLabel ?? '')
      && !isPatrolSgcWorkerId(objectLabel)
      && !isPatrolObjectId(objectLabel)) {
      return 'Người'
    }
    return 'Đối tượng'
  }
  return ''
}

/** Dòng phụ — sgc master; OBJ hiển thị phụ khi có. */
export function patrolWorkforceEventSubjectId(
  objectId?: string | null,
  trackWorkerId?: string | null,
): string {
  const oid = objectId?.trim() ?? ''
  const track = trackWorkerId?.trim() ?? ''
  const sgc = isPatrolSgcWorkerId(track)
    ? track
    : isPatrolSgcWorkerId(oid)
      ? oid
      : ''
  const obj = isPatrolObjectId(oid) ? oid : ''

  if (sgc && obj) return `${sgc} · ${obj}`
  if (sgc) return sgc
  if (obj) return obj
  if (track) return track
  return oid || '—'
}

export function formatPatrolPersonDetectedEvent(event: PatrolEvent): PatrolEvent {
  if (event.type !== 'PERSON_DETECTED') return event

  const trackWorkerId = event.trackWorkerId
    ?? (isPatrolSgcWorkerId(event.objectId) ? event.objectId : undefined)
  const title = patrolWorkforceEventTitle(
    event.type,
    event.objectId,
    event.objectLabel,
    trackWorkerId,
  )
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

/** Khóa master dedup — ưu tiên sgc; nhiều OBJ cùng sgc → 1 entity. */
export function patrolEventMasterEntityKey(event: PatrolEvent): string {
  const objectId = event.objectId?.trim() ?? ''
  const trackWorkerId = event.trackWorkerId?.trim() ?? ''

  if (isPatrolSgcWorkerId(trackWorkerId)) return trackWorkerId.toUpperCase()
  if (isPatrolSgcWorkerId(objectId)) return objectId.toUpperCase()
  if (objectId && isPatrolManuallyIdentified(objectId)) return objectId.toUpperCase()
  if (trackWorkerId && isPatrolManuallyIdentified(trackWorkerId)) return trackWorkerId.toUpperCase()

  // Chưa có sgc — mỗi sự kiện riêng (partial / track tạm)
  return `EV:${event.id}`
}

/** Gộp list — giữ snapshot mới nhất theo master key. */
export function dedupePatrolEventsByMasterEntity(events: PatrolEvent[]): PatrolEvent[] {
  const byKey = new Map<string, PatrolEvent>()
  for (const event of events) {
    const key = patrolEventMasterEntityKey(event)
    const prev = byKey.get(key)
    if (
      !prev
      || new Date(event.lockedAt).getTime() > new Date(prev.lockedAt).getTime()
    ) {
      byKey.set(key, event)
    }
  }
  return [...byKey.values()].sort(
    (a, b) => new Date(b.lockedAt).getTime() - new Date(a.lockedAt).getTime(),
  )
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

/** @deprecated dùng patrolEventMasterEntityKey */
export function patrolEventEntityKey(event: PatrolEvent): string {
  return patrolEventMasterEntityKey(event)
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
    keys.add(patrolEventMasterEntityKey(event))
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
