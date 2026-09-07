import { describe, expect, it } from 'vitest'
import { resolvePatrolTier, resolvePatrolPersonStage, tierEverFromPersonRow } from './resolvePatrolTier'
import type { PatrolEvent } from '../data/patrolTypes'

describe('resolvePatrolTier', () => {
  it('đọc tier_snapshot trực tiếp', () => {
    expect(
      resolvePatrolTier({
        tierSnapshot: {
          tier: 'identity',
          tier_rank: 2,
          tier_since: 0,
          subject_id: 'p-1',
          face_eligible: true,
          confidence: 0.92,
          snapshot_score: 1.5,
        },
      }),
    ).toBe('identity')
  })

  it('person stage không downtier vì snapshotScore thấp', () => {
    const event = {
      stage: 'person',
      snapshotScore: 0.5,
    } as PatrolEvent
    expect(resolvePatrolPersonStage(event)).toBe('person')
  })

  it('tierEverFromPersonRow ưu tiên tier_ever hơn tier_snapshot thấp hơn', () => {
    expect(
      tierEverFromPersonRow({
        status: 'person',
        tierEver: 'person',
        tierSnapshot: {
          tier: 'object',
          tier_rank: 0,
          tier_since: 0,
          subject_id: 'tk-0000001',
          face_eligible: true,
          confidence: 0.9,
          snapshot_score: 2.6,
        },
        snapshotScore: 2.6,
      }),
    ).toBe('person')
  })

  it('tierEverFromPersonRow ưu tiên tier_ever identity', () => {
    expect(
      tierEverFromPersonRow({
        status: 'person',
        tierEver: 'identity',
        snapshotScore: 0.5,
      }),
    ).toBe('identity')
  })

  it('resolvePatrolPersonStage — tier_ever person thắng snapshot object', () => {
    const event = {
      tierEver: 'person',
      tierSnapshot: {
        tier: 'object',
        tier_rank: 0,
        tier_since: 0,
        subject_id: 'tk-0000001',
        face_eligible: true,
        confidence: 0.9,
        snapshot_score: 2.6,
      },
      trackWorkerId: 'tk-0000001',
      objectId: 'tk-0000001',
      snapshotScore: 2.6,
    } as PatrolEvent
    expect(resolvePatrolPersonStage(event)).toBe('person')
  })
})
