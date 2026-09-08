import { describe, expect, it } from 'vitest'
import { resolvePatrolRoiDisplayTier } from './resolvePatrolRoiDisplayTier'

describe('resolvePatrolRoiDisplayTier', () => {
  it('person + quay lưng (faceEligibleNow false) → viền xám object', () => {
    expect(resolvePatrolRoiDisplayTier('person', { faceEligibleNow: false })).toBe('object')
    expect(resolvePatrolRoiDisplayTier('person', { faceEligible: false })).toBe('object')
  })

  it('person + thấy mặt frame này → cam Người', () => {
    expect(resolvePatrolRoiDisplayTier('person', { faceEligibleNow: true })).toBe('person')
  })

  it('identity + quay lưng → viền xám (chưa thấy mặt frame này)', () => {
    expect(resolvePatrolRoiDisplayTier('identity', { faceEligibleNow: false })).toBe('object')
  })

  it('identity + thấy mặt → xanh Định danh', () => {
    expect(resolvePatrolRoiDisplayTier('identity', { faceEligibleNow: true })).toBe('identity')
  })

  it('gallery id trên tier person — mặt frame này → identity', () => {
    expect(
      resolvePatrolRoiDisplayTier('person', {
        faceEligibleNow: true,
        workerId: 'p-SGC-6688',
      }),
    ).toBe('identity')
  })

  it('promotedFrom không hạ tier nội bộ — chỉ nhãn phụ', () => {
    expect(
      resolvePatrolRoiDisplayTier('person', {
        faceEligibleNow: true,
        workerId: 'tk-00000042',
        promotedFrom: ['obj-20260904-0002'],
      }),
    ).toBe('person')
  })

  it('ưu tiên tier_snapshot từ BE khi có mặt', () => {
    expect(
      resolvePatrolRoiDisplayTier('object', {
        faceEligibleNow: true,
        tierSnapshot: {
          tier: 'person',
          tier_rank: 1,
          tier_since: 0,
          subject_id: 'tk-1',
          face_eligible: true,
          confidence: 0.9,
          snapshot_score: 1.2,
        },
      }),
    ).toBe('person')
  })
})
