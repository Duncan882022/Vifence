import { describe, expect, it } from 'vitest'
import type { PatrolEvent } from '../data/patrolTypes'
import {
  isPatrolPersonLifecycleEvent,
  isPatrolPersonLifecycleWithSnapshot,
} from './patrolEventsFeed'

function baseEvent(overrides: Partial<PatrolEvent> = {}): PatrolEvent {
  return {
    id: 'pers:pers-0001',
    type: 'PERSON_DETECTED',
    cameraId: 'HC-01',
    cameraName: 'HC-01',
    zoneId: null,
    zoneName: null,
    objectId: 'pers-0001',
    objectLabel: 'Test',
    violationLabel: 'Test',
    startedAt: new Date().toISOString(),
    lockedAt: new Date().toISOString(),
    endedAt: null,
    durationSeconds: null,
    status: 'LOCKED',
    confidence: 1,
    gps: { lat: 0, lng: 0 },
    snapshotUrl: undefined,
    snapshotScore: 0,
    stage: 'person',
    ...overrides,
  } as PatrolEvent
}

describe('isPatrolPersonLifecycleEvent', () => {
  it('hides person tab until face-evidence snapshot exists', () => {
    const event = baseEvent({ snapshotUrl: undefined, snapshotScore: 0, stage: 'profile' })
    expect(isPatrolPersonLifecycleEvent(event)).toBe(false)
  })

  it('hides người card when snapshot score high but no face_eligible', () => {
    const event = baseEvent({
      snapshotUrl: 'https://example.com/snap.jpg',
      snapshotScore: 1.5,
      stage: 'person',
      tierSnapshot: {
        tier: 'person',
        tier_rank: 1,
        tier_since: 0,
        subject_id: 'tk-1',
        face_eligible: false,
        confidence: 0.9,
        snapshot_score: 1.5,
      },
    })
    expect(isPatrolPersonLifecycleEvent(event)).toBe(false)
  })

  it('keeps person events when snapshot proves re-id', () => {
    const event = baseEvent({
      snapshotUrl: 'https://example.com/snap.jpg',
      snapshotScore: 1.2,
      stage: 'person',
      tierSnapshot: {
        tier: 'person',
        tier_rank: 1,
        tier_since: 0,
        subject_id: 'tk-1',
        face_eligible: true,
        confidence: 0.85,
        snapshot_score: 1.2,
      },
    })
    expect(isPatrolPersonLifecycleEvent(event)).toBe(true)
  })

  it('shows object events with low score and no snapshot', () => {
    const event = baseEvent({
      id: 'obj:obj-1',
      objectId: 'obj-1',
      objectLabel: 'Đối tượng',
      stage: 'object',
      snapshotUrl: undefined,
      snapshotScore: 0,
    })
    expect(isPatrolPersonLifecycleEvent(event)).toBe(true)
  })

  it('filters mis-tiered object when snapshot score implies face', () => {
    const event = baseEvent({
      id: 'obj:obj-2',
      objectId: 'obj-2',
      stage: 'object',
      snapshotUrl: 'https://example.com/snap.jpg',
      snapshotScore: 1.5,
    })
    expect(isPatrolPersonLifecycleEvent(event)).toBe(false)
  })

  it('keeps person events when snapshot score meets gate', () => {
    const event = baseEvent({
      snapshotUrl: 'https://example.com/snap.jpg',
      snapshotScore: 1.2,
      stage: 'person',
      tierSnapshot: {
        tier: 'person',
        tier_rank: 1,
        tier_since: 0,
        subject_id: 'tk-1',
        face_eligible: true,
        confidence: 0.85,
        snapshot_score: 1.2,
      },
    })
    expect(isPatrolPersonLifecycleEvent(event)).toBe(true)
  })

  it('shows tk card when tier_ever person but tier_snapshot object', () => {
    const event = baseEvent({
      id: 'pers:tk-0000001',
      objectId: 'tk-0000001',
      trackWorkerId: 'tk-0000001',
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
      snapshotUrl: 'https://example.com/snap.jpg',
      snapshotScore: 2.6,
      stage: 'person',
    })
    expect(isPatrolPersonLifecycleEvent(event)).toBe(true)
  })
})
