import type { PatrolDayObject, PatrolDayPerson } from '../services/patrolDayEvents.service'
import type { PatrolEvent } from '../data/patrolTypes'
import { getPatrolTkKeysForObject } from '../services/patrolTkObjectLink.service'
import {
  isPatrolTrackWorkerId,
  patrolEventMasterEntityKey,
} from './patrolWorkforceEventLabels'

/**
 * Điểm snapshot = face_quality×2 + confidence.
 * Đối tượng (chưa mặt) thường ≤ ~1.0; có mặt rõ thì cao hơn — đó là thẻ
 * nhầm tầng, không phải lưng thật trong nhóm lẫn Người + Đối tượng.
 */
export const PATROL_OBJECT_FACE_SNAPSHOT_SCORE = 1.05

/** Một obj có được hiển thị tab Đối tượng không. */
export function isPatrolDayObjectDisplayable(
  obj: PatrolDayObject,
  _persons: PatrolDayPerson[] = [],
): boolean {
  const score = obj.snapshotScore ?? 0
  if (score >= PATROL_OBJECT_FACE_SNAPSHOT_SCORE) return false
  return true
}

/**
 * Tab Đối tượng: lưng / chưa mặt.
 * Không ẩn theo trùng giờ với thẻ Người — trong một nhóm vừa mặt vừa lưng
 * cả hai tầng phải cùng hiện.
 */
export function filterPatrolDayObjectsForDisplay(
  objects: PatrolDayObject[],
  persons: PatrolDayPerson[],
): PatrolDayObject[] {
  return objects.filter(obj => isPatrolDayObjectDisplayable(obj, persons))
}

/** Ẩn thẻ obj-* khi đã có thẻ Người cùng tk (promote / link local). */
export function filterPatrolObjectEventsWithLinkedPerson(
  events: PatrolEvent[],
): PatrolEvent[] {
  const linkedTk = new Set<string>()
  const persIds = new Set<string>()

  for (const event of events) {
    const fromPers = event.id.match(/^pers:(.+)$/i)?.[1]?.trim().toLowerCase()
    if (fromPers) persIds.add(fromPers)
    const tk = event.trackWorkerId?.trim()
    if (isPatrolTrackWorkerId(tk)) linkedTk.add(tk.toUpperCase())
    const oid = event.objectId?.trim()
    if (isPatrolTrackWorkerId(oid)) linkedTk.add(oid.toUpperCase())
  }

  return events.filter(event => {
    const fromObj = event.id.match(/^obj:(.+)$/i)?.[1]?.trim()
    if (!fromObj) return true
    for (const tk of getPatrolTkKeysForObject(fromObj)) {
      if (linkedTk.has(tk.toUpperCase())) return false
    }
    const promotedPers = fromObj.replace(/^obj-/i, 'pers-')
    if (persIds.has(promotedPers.toLowerCase())) return false
    return true
  })
}

/** Gộp thẻ trùng entity — giữ snapshot mới nhất, tránh 1 người → 2 card. */
export function dedupePatrolEventsStrictByEntity(events: PatrolEvent[]): PatrolEvent[] {
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
