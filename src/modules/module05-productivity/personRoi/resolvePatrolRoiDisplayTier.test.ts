import { describe, expect, it } from 'vitest'
import { resolvePatrolRoiDisplayTier } from './resolvePatrolRoiDisplayTier'

describe('resolvePatrolRoiDisplayTier', () => {
  it('giữ object khi chưa face_eligible', () => {
    expect(resolvePatrolRoiDisplayTier('person', { faceEligible: false })).toBe('object')
    expect(resolvePatrolRoiDisplayTier('person', {})).toBe('object')
  })

  it('person khi face_eligible — đồng bộ tab Người', () => {
    expect(resolvePatrolRoiDisplayTier('person', { faceEligible: true })).toBe('person')
  })

  it('identity luôn hiển thị dù quay lưng', () => {
    expect(resolvePatrolRoiDisplayTier('identity', { faceEligible: false })).toBe('identity')
  })

  it('gallery id trên tier person vẫn hiển thị người', () => {
    expect(
      resolvePatrolRoiDisplayTier('person', {
        faceEligible: false,
        workerId: 'p-SGC-6688',
      }),
    ).toBe('person')
  })

  it('đã ghi hồ sơ obj-* — ROI hiển thị tầng Đối tượng', () => {
    expect(
      resolvePatrolRoiDisplayTier('person', {
        faceEligible: true,
        workerId: 'tk-00000042',
        promotedFrom: ['obj-20260904-0002'],
      }),
    ).toBe('object')
  })
})
