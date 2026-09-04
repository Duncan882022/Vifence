import { describe, expect, it } from 'vitest'
import {
  comparePatrolAppearanceSegments,
  formatAppearanceTimeRange,
  type PatrolAppearanceSegment,
} from './patrolDayEvents.service'

function segment(partial: Partial<PatrolAppearanceSegment> & Pick<PatrolAppearanceSegment, 'startedAt'>): PatrolAppearanceSegment {
  return {
    cameraId: 'HC-02',
    startedAt: partial.startedAt,
    endedAt: partial.endedAt ?? partial.startedAt + 30,
    ...partial,
  }
}

describe('comparePatrolAppearanceSegments', () => {
  it('ưu tiên presenceSeq giảm dần (lượt mới trên cùng)', () => {
    const rows = [
      segment({ id: 1, startedAt: 100, presenceSeq: 2 }),
      segment({ id: 2, startedAt: 200, presenceSeq: 3 }),
      segment({ id: 3, startedAt: 50, presenceSeq: 1 }),
    ].sort(comparePatrolAppearanceSegments)
    expect(rows.map(r => r.presenceSeq)).toEqual([3, 2, 1])
  })

  it('tie-break theo startedAt khi presenceSeq bằng nhau', () => {
    const rows = [
      segment({ id: 1, startedAt: 100, presenceSeq: 2 }),
      segment({ id: 2, startedAt: 150, presenceSeq: 2 }),
    ].sort(comparePatrolAppearanceSegments)
    expect(rows.map(r => r.startedAt)).toEqual([150, 100])
  })
})

describe('formatAppearanceTimeRange', () => {
  it('hiển thị giây để phân biệt hai lượt cùng phút', () => {
    expect(formatAppearanceTimeRange(1_700_000_000)).toMatch(/:\d{2}$/)
    expect(formatAppearanceTimeRange(1_700_000_000)).not.toBe(formatAppearanceTimeRange(1_700_000_013))
  })
})
