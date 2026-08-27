import { describe, expect, it } from 'vitest'
import type { PatrolDayPresence } from '../services/patrolDayEvents.service'
import {
  buildPatrolDayHeatmapDots,
  buildPatrolPresenceHeatmapDots,
  filterRecentPatrolWorkerEvents,
  filterRecentPresences,
} from './patrolDayHeatmapDots'
import type { PatrolEvent } from '../data/patrolMockData'
import { PATROL_SITE_CENTER } from '../data/patrolSiteMap'
import { countPatrolGlobalWorkers, summarizePatrolGlobalWorkers } from './patrolPatrolCounts'

function makeDayEvent(over: Partial<PatrolEvent>): PatrolEvent {
  return {
    id: 'pers:pers-0001',
    type: 'PERSON_DETECTED',
    cameraId: '',
    cameraName: '',
    zoneId: 'ZONE_SITE',
    zoneName: 'Site',
    objectId: 'pers-0001',
    objectLabel: 'pers-0001',
    violationLabel: 'pers-0001',
    startedAt: '2026-08-26T08:00:00Z',
    lockedAt: '2026-08-26T08:00:00Z',
    endedAt: null,
    durationSeconds: null,
    status: 'LOCKED',
    confidence: 1,
    gps: { lat: 0, lng: 0 },
    snapshotUrl: 'https://example.com/snap.jpg',
    stage: 'person',
    ...over,
  } as PatrolEvent
}

function makePresence(over: Partial<PatrolDayPresence>): PatrolDayPresence {
  return {
    id: 1,
    subjectId: 'pers-0001',
    cameraId: 'HC-01',
    zoneId: 'ZONE_SITE',
    startedAt: 1_700_000_000,
    endedAt: 1_700_000_030,
    gpsLat: PATROL_SITE_CENTER[0],
    gpsLng: PATROL_SITE_CENTER[1],
    presenceSeq: 1,
    tier: 'person',
    displayName: 'pers-0001',
    sourceCameras: ['HC-01'],
    ...over,
  }
}

describe('buildPatrolPresenceHeatmapDots', () => {
  it('một presence → một chấm tại GPS', () => {
    const dots = buildPatrolPresenceHeatmapDots([makePresence({})])
    expect(dots).toHaveLength(1)
    expect(dots[0].objectId).toBe('pers-0001')
    expect(dots[0].position[0]).toBeCloseTo(PATROL_SITE_CENTER[0], 3)
  })

  it('hai presence cùng người khác lượt → hai chấm', () => {
    const dots = buildPatrolPresenceHeatmapDots([
      makePresence({ id: 1, presenceSeq: 1, gpsLat: PATROL_SITE_CENTER[0], gpsLng: PATROL_SITE_CENTER[1] }),
      makePresence({
        id: 2,
        presenceSeq: 2,
        gpsLat: PATROL_SITE_CENTER[0] + 0.0002,
        gpsLng: PATROL_SITE_CENTER[1] + 0.0002,
      }),
    ])
    expect(dots).toHaveLength(2)
  })

  it('obj tier khi includeUnassigned', () => {
    const dots = buildPatrolPresenceHeatmapDots(
      [makePresence({ subjectId: 'obj-20260826-0001', tier: 'object' })],
      { includeUnassigned: true },
    )
    expect(dots).toHaveLength(1)
  })

  it('liveOnly lọc presence gần đây', () => {
    const old = makePresence({ endedAt: 1_000_000_000 })
    const recent = makePresence({ id: 2, endedAt: Date.now() / 1000 })
    const scoped = filterRecentPresences([old, recent], Date.now())
    expect(scoped).toHaveLength(1)
  })
})

describe('buildPatrolDayHeatmapDots legacy fallback', () => {
  it('một thẻ pers-* → một chấm', () => {
    const dots = buildPatrolDayHeatmapDots([makeDayEvent({})])
    expect(dots).toHaveLength(1)
    expect(dots[0].objectId).toBe('pers-0001')
  })

  it('liveOnly chỉ giữ người gần đây', () => {
    const old = makeDayEvent({
      id: 'pers:pers-0002',
      objectId: 'pers-0002',
      lockedAt: '2020-01-01T08:00:00Z',
    })
    const recent = makeDayEvent({
      id: 'pers:pers-0003',
      objectId: 'pers-0003',
      lockedAt: new Date().toISOString(),
    })
    const scoped = filterRecentPatrolWorkerEvents([old, recent], Date.now())
    expect(scoped).toHaveLength(1)
    expect(scoped[0].objectId).toBe('pers-0003')
  })
})

describe('countPatrolGlobalWorkers SQLite-first', () => {
  it('đếm theo pers day card, không cộng registry', () => {
    const events = [
      makeDayEvent({ id: 'pers:pers-0001', objectId: 'pers-0001' }),
      makeDayEvent({
        id: 'pers:pers-0002',
        objectId: 'pers-0002',
        objectLabel: 'pers-0002',
        lockedAt: '2026-08-26T09:00:00Z',
      }),
    ]
    expect(countPatrolGlobalWorkers(events)).toBe(2)
    const summary = summarizePatrolGlobalWorkers(events)
    expect(summary.total).toBe(2)
    expect(summary.person).toBe(2)
  })
})
