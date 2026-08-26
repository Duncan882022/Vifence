import type { PatrolDayObject, PatrolDayPerson } from '../services/patrolDayEvents.service'

/**
 * Điểm snapshot = face_quality×2 + confidence.
 * Đối tượng (chưa mặt) thường ≤ ~1.0; có mặt rõ thì cao hơn.
 */
export const PATROL_OBJECT_FACE_SNAPSHOT_SCORE = 1.05

/** Trùng thời gian với thẻ Người → cùng entity, obj orphan do track tách. */
const PERSON_OVERLAP_SEC = 90

function objectOverlapsPerson(obj: PatrolDayObject, persons: PatrolDayPerson[]): boolean {
  for (const p of persons) {
    if (obj.lastSeen >= p.firstSeen - PERSON_OVERLAP_SEC
      && obj.firstSeen <= p.lastSeen + PERSON_OVERLAP_SEC) {
      return true
    }
  }
  return false
}

/** Một obj có được hiển thị tab Đối tượng không. */
export function isPatrolDayObjectDisplayable(
  obj: PatrolDayObject,
  persons: PatrolDayPerson[],
): boolean {
  const score = obj.snapshotScore ?? 0
  if (score >= PATROL_OBJECT_FACE_SNAPSHOT_SCORE) return false
  if (objectOverlapsPerson(obj, persons)) return false
  return true
}

/** Loại obj đã có mặt hoặc trùng thẻ Người — tab Đối tượng chỉ còn lưng/chưa mặt. */
export function filterPatrolDayObjectsForDisplay(
  objects: PatrolDayObject[],
  persons: PatrolDayPerson[],
): PatrolDayObject[] {
  return objects.filter(obj => isPatrolDayObjectDisplayable(obj, persons))
}
