import { describe, expect, it } from 'vitest'
import type { PatrolEvent } from '../data/patrolTypes'
import type { DetectionDot } from '../data/patrolDetectionData'
import {
  filterPatrolEventsByFlycamAltitude,
  filterPatrolHeatmapDotsExcludeAerialFlycam,
  filterPatrolPresencesForHeatmap,
  isPatrolHeatmapFlycamDotIncluded,
} from './patrolFlycamEventFilter'

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

  it('tầm thấp — giữ toàn bộ sự kiện như HC-*', () => {
    const object = makeEvent({ stage: 'object' })
    const person = makeEvent({ id: 'pers:2', stage: 'person' })
    const identity = makeEvent({ id: 'pers:3', type: 'IDENTITY_VERIFIED', stage: 'profile' })
    const filtered = filterPatrolEventsByFlycamAltitude(
      [object, person, identity],
      { 'DR-03': 'proximity' },
    )
    expect(filtered).toHaveLength(3)
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

describe('filterPatrolHeatmapDotsExcludeAerialFlycam', () => {
  const dot = (cameraId: string): DetectionDot => ({
    id: `dot-${cameraId}`,
    type: 'person',
    position: [0, 0],
    zoneId: 'ZONE_SITE',
    cameraId,
    confidence: 1,
  })

  it('DR-03 tầm cao — loại khỏi heatmap Module 05', () => {
    const filtered = filterPatrolHeatmapDotsExcludeAerialFlycam(
      [dot('HC-01'), dot('DR-03')],
      { 'DR-03': 'aerial' },
    )
    expect(filtered.map(d => d.cameraId)).toEqual(['HC-01'])
  })

  it('DR-03 tầm thấp — giữ trên heatmap', () => {
    const filtered = filterPatrolHeatmapDotsExcludeAerialFlycam(
      [dot('DR-03')],
      { 'DR-03': 'proximity' },
    )
    expect(filtered).toHaveLength(1)
  })

  it('isPatrolHeatmapFlycamDotIncluded mặc định aerial = loại DR-*', () => {
    expect(isPatrolHeatmapFlycamDotIncluded('DR-03', {})).toBe(false)
    expect(isPatrolHeatmapFlycamDotIncluded('HC-02', {})).toBe(true)
  })
})

describe('filterPatrolPresencesForHeatmap', () => {
  it('bỏ presence DR-03 khi tầm cao', () => {
    const filtered = filterPatrolPresencesForHeatmap(
      [{
        id: 1,
        subjectId: 'pers-1',
        cameraId: 'DR-03',
        zoneId: 'ZONE_SITE',
        startedAt: 1,
        endedAt: 2,
        gpsLat: 0,
        gpsLng: 0,
        presenceSeq: 1,
        tier: 'person',
        displayName: 'pers-1',
        sourceCameras: ['DR-03'],
      }],
      { 'DR-03': 'aerial' },
    )
    expect(filtered).toHaveLength(0)
  })
})
