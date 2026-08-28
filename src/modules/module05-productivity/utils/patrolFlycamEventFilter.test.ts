import { describe, expect, it } from 'vitest'
import type { PatrolEvent } from '../data/patrolTypes'
import { filterPatrolEventsByFlycamAltitude } from './patrolFlycamEventFilter'

function makeEvent(over: Partial<PatrolEvent>): PatrolEvent {
  return {
    id: 'pers:1',
    type: 'PERSON_DETECTED',
    cameraId: 'DR-03',
    cameraName: 'Drone 03',
    zoneId: 'ZONE_SITE',
    zoneName: 'Cầu Sông Hốt',
    objectId: 'OBJ-1',
    objectLabel: 'OBJ-1',
    violationLabel: 'Phát hiện người',
    startedAt: '2026-08-28T08:00:00.000Z',
    lockedAt: '2026-08-28T08:00:00.000Z',
    endedAt: null,
    durationSeconds: null,
    status: 'LOCKED',
    confidence: 0.9,
    gps: { lat: 10, lng: 106 },
    snapshotUrl: 'https://example.test/snap.jpg',
    ...over,
  }
}

describe('filterPatrolEventsByFlycamAltitude', () => {
  it('tầm cao — chỉ giữ đối tượng/mật độ flycam', () => {
    const object = makeEvent({ stage: 'object' })
    const person = makeEvent({ id: 'pers:2', stage: 'person' })
    const filtered = filterPatrolEventsByFlycamAltitude(
      [object, person],
      { 'DR-03': 'aerial' },
    )
    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.stage).toBe('object')
  })

  it('tầm thấp — giữ người/định danh flycam', () => {
    const object = makeEvent({ stage: 'object' })
    const person = makeEvent({ id: 'pers:2', stage: 'person' })
    const filtered = filterPatrolEventsByFlycamAltitude(
      [object, person],
      { 'DR-03': 'proximity' },
    )
    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.stage).toBe('person')
  })

  it('HC-* không bị lọc theo độ cao flycam', () => {
    const helmet = makeEvent({ cameraId: 'HC-01', stage: 'person' })
    const filtered = filterPatrolEventsByFlycamAltitude(
      [helmet],
      { 'DR-03': 'aerial' },
    )
    expect(filtered).toHaveLength(1)
  })
})
