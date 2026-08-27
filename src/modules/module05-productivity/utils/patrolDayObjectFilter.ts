import type { PatrolDayObject, PatrolDayPerson } from '../services/patrolDayEvents.service'

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
