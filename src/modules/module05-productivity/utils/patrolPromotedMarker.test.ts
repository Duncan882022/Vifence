import { describe, expect, it } from 'vitest'
import { resolvePatrolPromotedMarker } from './patrolPromotedMarker'

describe('resolvePatrolPromotedMarker', () => {
  it('không có mã gốc → không đánh dấu', () => {
    expect(resolvePatrolPromotedMarker({ promotedFrom: [] })).toBeNull()
    expect(resolvePatrolPromotedMarker({ promotedFrom: undefined })).toBeNull()
  })

  it('một Đối tượng gốc → nhãn gọn, tooltip nêu mã', () => {
    const marker = resolvePatrolPromotedMarker({ promotedFrom: ['obj-20260904-0002'] })
    expect(marker?.count).toBe(1)
    expect(marker?.label).toBe('Thăng hạng')
    expect(marker?.tooltip).toContain('obj-20260904-0002')
  })

  it('nhiều Đối tượng gốc → hiện số, vì đó là chỗ lịch sử dễ lẫn người', () => {
    const marker = resolvePatrolPromotedMarker({
      promotedFrom: ['obj-20260904-0002', 'obj-20260904-0036'],
    })
    expect(marker?.count).toBe(2)
    expect(marker?.label).toBe('Thăng hạng ×2')
    expect(marker?.tooltip).toContain('obj-20260904-0036')
  })

  it('bỏ qua chuỗi rỗng lọt từ GROUP_CONCAT', () => {
    expect(resolvePatrolPromotedMarker({ promotedFrom: ['', '  '] })).toBeNull()
    const marker = resolvePatrolPromotedMarker({ promotedFrom: ['', 'obj-1'] })
    expect(marker?.count).toBe(1)
  })
})
