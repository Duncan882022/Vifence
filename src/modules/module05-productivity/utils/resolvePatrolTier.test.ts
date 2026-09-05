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

  it('tierEverFromPersonRow ưu tiên tier_ever', () => {
    expect(
      tierEverFromPersonRow({
        status: 'person',
        tierEver: 'identity',
        snapshotScore: 0.5,
      }),
    ).toBe('identity')
  })
})
