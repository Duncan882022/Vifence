import { describe, expect, it } from 'vitest'
import {
  filterPatrolDayObjectsForDisplay,
  isPatrolDayObjectDisplayable,
  PATROL_OBJECT_FACE_SNAPSHOT_SCORE,
} from './patrolDayObjectFilter'
import type { PatrolDayObject, PatrolDayPerson } from '../services/patrolDayEvents.service'

const person = (overrides: Partial<PatrolDayPerson> = {}): PatrolDayPerson => ({
  persId: 'pers-0001',
  status: 'person',
  idenCode: null,
  displayName: 'pers-0001',
  fullName: null,
  employeeCode: null,
  contractor: null,
  firstSeen: 1_000,
  lastSeen: 2_000,
  ...overrides,
})

const obj = (overrides: Partial<PatrolDayObject> = {}): PatrolDayObject => ({
  objId: 'obj-20260826-0001',
  firstSeen: 900,
  lastSeen: 950,
  snapshotScore: 0.4,
  ...overrides,
})

describe('isPatrolDayObjectDisplayable', () => {
  it('loại đối tượng có snapshot điểm mặt cao', () => {
    expect(
      isPatrolDayObjectDisplayable(
        obj({ snapshotScore: PATROL_OBJECT_FACE_SNAPSHOT_SCORE }),
        [],
      ),
    ).toBe(false)
  })

  it('giữ đối tượng lưng điểm thấp', () => {
    expect(isPatrolDayObjectDisplayable(obj(), [])).toBe(true)
  })

  it('giữ đối tượng cùng giờ với thẻ Người — nhóm lẫn mặt và lưng', () => {
    expect(
      isPatrolDayObjectDisplayable(
        obj({ firstSeen: 1_100, lastSeen: 1_500 }),
        [person()],
      ),
    ).toBe(true)
  })
})

describe('filterPatrolDayObjectsForDisplay', () => {
  it('chỉ loại obj nhầm tầng (điểm mặt), giữ lưng trong nhóm', () => {
    const persons = [person()]
    const items = [
      obj(),
      obj({ objId: 'obj-2', snapshotScore: 1.2 }),
      obj({ objId: 'obj-3', firstSeen: 1_200, lastSeen: 1_800 }),
    ]
    expect(filterPatrolDayObjectsForDisplay(items, persons).map(o => o.objId)).toEqual([
      'obj-20260826-0001',
      'obj-3',
    ])
  })
})
