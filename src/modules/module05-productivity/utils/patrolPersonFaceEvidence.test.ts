import { describe, expect, it } from 'vitest'
import {
  patrolEventSnapshotProvesReId,
  patrolPersonSnapshotProvesReId,
} from './patrolPersonFaceEvidence'
import type { PatrolEvent } from '../data/patrolTypes'

describe('patrolPersonSnapshotProvesReId', () => {
  it('requires face_eligible and score gate', () => {
    expect(
      patrolPersonSnapshotProvesReId({
        snapshotUrl: 'https://example.com/a.jpg',
        snapshotScore: 1.4,
        tierSnapshot: {
          tier: 'person',
          tier_rank: 1,
          tier_since: 0,
          subject_id: 'tk-1',
          face_eligible: false,
          confidence: 0.9,
          snapshot_score: 1.4,
        },
      }),
    ).toBe(false)
  })

  it('passes when face evidence meets gate', () => {
    expect(
      patrolPersonSnapshotProvesReId({
        snapshotUrl: 'https://example.com/a.jpg',
        snapshotScore: 1.4,
        tierSnapshot: {
          tier: 'person',
          tier_rank: 1,
          tier_since: 0,
          subject_id: 'tk-1',
          face_eligible: true,
          confidence: 0.9,
          snapshot_score: 1.4,
        },
      }),
    ).toBe(true)
  })
})

describe('patrolEventSnapshotProvesReId', () => {
  it('maps event fields', () => {
    const event = {
      snapshotUrl: 'https://example.com/a.jpg',
      snapshotScore: 1.2,
      tierSnapshot: {
        tier: 'person',
        tier_rank: 1,
        tier_since: 0,
        subject_id: 'tk-1',
        face_eligible: true,
        confidence: 0.85,
        snapshot_score: 1.2,
      },
    } as PatrolEvent
    expect(patrolEventSnapshotProvesReId(event)).toBe(true)
  })
})
