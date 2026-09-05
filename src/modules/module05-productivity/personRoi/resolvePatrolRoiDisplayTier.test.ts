import { describe, expect, it } from 'vitest'
import { resolvePatrolRoiDisplayTier } from './resolvePatrolRoiDisplayTier'

describe('resolvePatrolRoiDisplayTier', () => {
  it('person không downtier khi chưa face_eligible', () => {
    expect(resolvePatrolRoiDisplayTier('person', { faceEligible: false })).toBe('person')
    expect(resolvePatrolRoiDisplayTier('person', {})).toBe('person')
  })

  it('person khi face_eligible', () => {
    expect(resolvePatrolRoiDisplayTier('person', { faceEligible: true })).toBe('person')
  })

  it('identity luôn hiển thị dù quay lưng', () => {
    expect(resolvePatrolRoiDisplayTier('identity', { faceEligible: false })).toBe('identity')
  })

  it('gallery id trên tier person', () => {
    expect(
      resolvePatrolRoiDisplayTier('person', {
        faceEligible: false,
        workerId: 'p-SGC-6688',
      }),
    ).toBe('person')
  })

  it('promotedFrom không hạ tier — chỉ nhãn phụ', () => {
    expect(
      resolvePatrolRoiDisplayTier('person', {
        faceEligible: true,
        workerId: 'tk-00000042',
        promotedFrom: ['obj-20260904-0002'],
      }),
    ).toBe('person')
  })

  it('ưu tiên tier_snapshot từ BE', () => {
    expect(
      resolvePatrolRoiDisplayTier('object', {
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
