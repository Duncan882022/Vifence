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
    snapshotUrl: null,
    snapshotScore: 0,
    stage: 'person',
    ...overrides,
  } as PatrolEvent
}

describe('isPatrolPersonLifecycleEvent', () => {
  it('shows events without snapshot (pending evidence)', () => {
    const event = baseEvent({ snapshotUrl: null, snapshotScore: 0, stage: 'profile' })
    expect(isPatrolPersonLifecycleEvent(event)).toBe(true)
    expect(isPatrolPersonLifecycleWithSnapshot(event)).toBe(true)
  })

  it('shows object events with low score and no snapshot', () => {
    const event = baseEvent({
      id: 'obj:obj-1',
      objectId: 'obj-1',
      objectLabel: 'Đối tượng',
      stage: 'object',
      snapshotUrl: null,
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
    })
    expect(isPatrolPersonLifecycleEvent(event)).toBe(true)
  })
})
