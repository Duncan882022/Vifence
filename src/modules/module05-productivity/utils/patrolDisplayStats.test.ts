import { describe, expect, it } from 'vitest'
import type { PatrolEvent } from '../data/patrolTypes'
import { derivePatrolDisplayStats } from './patrolDisplayStats'
import type { PatrolDayStats } from '../services/patrolDayEvents.service'

function makeEvent(over: Partial<PatrolEvent>): PatrolEvent {
  return {
    id: 'pers:pers-0001',
    type: 'PERSON_DETECTED',
    cameraId: 'HC-02',
    cameraName: 'Cam',
    zoneId: 'z-1',
    zoneName: 'Khu',
    objectId: 'pers-0001',
    objectLabel: 'Người',
    violationLabel: 'Người',
    startedAt: new Date().toISOString(),
    lockedAt: new Date().toISOString(),
    endedAt: null,
    durationSeconds: null,
    status: 'LOCKED',
    confidence: 0.8,
    gps: { lat: 0, lng: 0 },
    snapshotUrl: 'https://example.com/a.jpg',
    snapshotScore: 1.2,
    stage: 'person',
    ...over,
  } as PatrolEvent
}

const backendStats: PatrolDayStats = {
  date: '2026-08-31',
  workersStandard: 99,
  personCount: 88,
  identityCount: 77,
  objectCount: 0,
  encountersStandard: 12,
  unassignedObservations: 5,
}

describe('derivePatrolDisplayStats', () => {
  it('gom KPI entity về cùng bộ đếm tab sự kiện', () => {
    const events = [
      makeEvent({ id: 'pers:pers-0001', objectId: 'pers-0001', stage: 'person' }),
      makeEvent({
        id: 'pers:pers-0002',
        objectId: 'pers-0002',
        stage: 'profile',
        objectLabel: 'An',
        violationLabel: 'An',
      }),
      makeEvent({
        id: 'obj:obj-0001',
        objectId: 'obj-0001',
        objectLabel: 'Đối tượng',
        violationLabel: 'Đối tượng',
        stage: 'object',
        snapshotScore: 0.8,
      }),
      makeEvent({
        id: 'pers:pers-0003',
        objectId: 'pers-0003',
        snapshotUrl: undefined,
        snapshotScore: 0,
      }),
    ]
    const stats = derivePatrolDisplayStats(events, backendStats)
    expect(stats.workersStandard).toBe(3)
    expect(stats.personCount).toBe(1)
    expect(stats.identityCount).toBe(1)
    expect(stats.objectCount).toBe(1)
    expect(stats.encountersStandard).toBe(12)
    expect(stats.unassignedObservations).toBe(5)
  })
})
