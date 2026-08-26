import { describe, expect, it } from 'vitest'
import type { PatrolEvent } from '../data/patrolMockData'
import { buildPatrolDayHeatmapDots, filterRecentPatrolWorkerEvents } from './patrolDayHeatmapDots'
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

describe('patrolDayHeatmapDots', () => {
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

  it('inCameraView chỉ true khi gần đây và camera nguồn online', () => {
    const now = Date.parse('2026-08-26T10:00:00Z')
    const recent = makeDayEvent({
      cameraId: 'HC-02',
      lockedAt: '2026-08-26T09:59:30Z',
    })
    const offline = buildPatrolDayHeatmapDots([recent], {
      now,
      cameraOnlineById: { 'HC-02': false },
    })
    expect(offline[0].inCameraView).toBe(false)

    const online = buildPatrolDayHeatmapDots([recent], {
      now,
      cameraOnlineById: { 'HC-02': true },
    })
    expect(online[0].inCameraView).toBe(true)
  })

  it('camera HC-01 online không làm chấm HC-02 nhấp nháy', () => {
    const now = Date.parse('2026-08-26T10:00:00Z')
    const recent = makeDayEvent({
      cameraId: 'HC-02',
      lockedAt: '2026-08-26T09:59:30Z',
    })
    const dots = buildPatrolDayHeatmapDots([recent], {
      now,
      cameraOnlineById: { 'HC-01': true, 'HC-02': false },
    })
    expect(dots[0].inCameraView).toBe(false)
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
