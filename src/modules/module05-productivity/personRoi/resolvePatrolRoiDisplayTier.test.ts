import { describe, expect, it } from 'vitest'
import {
  patrolLiveRoiQualifiesOrange,
  resolvePatrolRoiDisplayTier,
} from './resolvePatrolRoiDisplayTier'

describe('resolvePatrolRoiDisplayTier', () => {
  it('person quay lưng không cam — chỉ xám', () => {
    expect(resolvePatrolRoiDisplayTier('person', { faceEligible: false })).toBe('object')
    expect(resolvePatrolRoiDisplayTier('person', {})).toBe('object')
  })

  it('person mặt mạnh frame này — cam', () => {
    expect(
      resolvePatrolRoiDisplayTier('person', {
        faceEligible: true,
        snapshotScore: 1.2,
      }),
    ).toBe('person')
  })

  it('person hồ sơ draft — cam kể cả quay lưng', () => {
    expect(
      resolvePatrolRoiDisplayTier('person', {
        faceEligible: false,
        profileStatus: 'draft',
        workerId: 'tk-00000042',
      }),
    ).toBe('person')
  })

  it('identity luôn xanh dù quay lưng', () => {
    expect(resolvePatrolRoiDisplayTier('identity', { faceEligible: false })).toBe('identity')
  })

  it('gallery id luôn xanh khi quay lưng', () => {
    expect(
      resolvePatrolRoiDisplayTier('person', {
        faceEligible: false,
        workerId: 'p-SGC-6688',
      }),
    ).toBe('identity')
  })

  it('tk-* quay lưng không draft — xám', () => {
    expect(
      resolvePatrolRoiDisplayTier('person', {
        faceEligible: false,
        workerId: 'tk-00000042',
      }),
    ).toBe('object')
  })

  it('object + mặt mạnh — cam (người mới trên camera)', () => {
    expect(
      resolvePatrolRoiDisplayTier('object', {
        faceEligible: true,
        snapshotScore: 1.15,
      }),
    ).toBe('person')
  })

  it('promotedFrom không tự cam khi quay lưng', () => {
    expect(
      resolvePatrolRoiDisplayTier('person', {
        faceEligible: false,
        workerId: 'tk-00000042',
        promotedFrom: ['obj-20260904-0002'],
      }),
    ).toBe('object')
  })

  it('ưu tiên tier_snapshot từ BE — draft giữ cam', () => {
    expect(
      resolvePatrolRoiDisplayTier('object', {
        tierSnapshot: {
          tier: 'person',
          tier_rank: 1,
          tier_since: 0,
          subject_id: 'tk-1',
          face_eligible: false,
          confidence: 0.9,
          snapshot_score: 0.4,
          profile_status: 'draft',
        },
      }),
    ).toBe('person')
  })

  it('tier_snapshot person nhưng không draft/mặt — xám', () => {
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
        faceEligible: false,
        snapshotScore: 0.3,
      }),
    ).toBe('object')
  })
})

describe('patrolLiveRoiQualifiesOrange', () => {
  it('draft hoặc mặt mạnh', () => {
    expect(patrolLiveRoiQualifiesOrange({ profileStatus: 'draft' })).toBe(true)
    expect(
      patrolLiveRoiQualifiesOrange({ faceEligible: true, snapshotScore: 1.06 }),
    ).toBe(true)
    expect(
      patrolLiveRoiQualifiesOrange({ faceEligible: true, snapshotScore: 1.0 }),
    ).toBe(false)
  })
})
