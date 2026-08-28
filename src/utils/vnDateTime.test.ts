import { describe, expect, it } from 'vitest'
import { formatVnDate, getPatrolWorkDate } from './vnDateTime'

describe('getPatrolWorkDate', () => {
  it('sau 6h sáng VN — cùng ngày lịch', () => {
    const noon = new Date('2026-08-29T05:00:00.000Z') // 12:00 VN
    expect(getPatrolWorkDate(noon)).toBe('2026-08-29')
  })

  it('trước 6h sáng VN — vẫn thuộc ca ngày hôm trước', () => {
    const afterMidnight = new Date('2026-08-28T17:05:00.000Z') // 00:05 VN ngày 29
    expect(formatVnDate(afterMidnight)).toBe('2026-08-29')
    expect(getPatrolWorkDate(afterMidnight)).toBe('2026-08-28')
  })

  it('23:56 VN — ngày lịch và ca trùng nhau', () => {
    const lateNight = new Date('2026-08-28T16:56:00.000Z') // 23:56 VN ngày 28
    expect(getPatrolWorkDate(lateNight)).toBe('2026-08-28')
  })
})
