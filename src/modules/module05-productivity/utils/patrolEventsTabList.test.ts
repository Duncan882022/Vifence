import { describe, expect, it } from 'vitest'
import type { PatrolEvent } from '../data/patrolTypes'
import { countUniquePatrolTabEntities, computePatrolTabCounts, listPatrolEventsForTab } from './patrolEventsTabList'

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

describe('listPatrolEventsForTab', () => {
  it('tab badge và list length khớp nhau', () => {
    const events = [
      makeEvent({ id: 'pers:pers-0001', objectId: 'pers-0001' }),
      makeEvent({ id: 'pers:pers-0002', objectId: 'pers-0002' }),
      makeEvent({
        id: 'pers:pers-0003',
        objectId: 'pers-0003',
        snapshotUrl: undefined,
        snapshotScore: 0,
      }),
    ]
    const list = listPatrolEventsForTab(events, 'all')
    expect(list).toHaveLength(2)
    expect(countUniquePatrolTabEntities(events, 'all')).toBe(list.length)
  })

  it('không đếm sự kiện chờ snapshot (pending evidence)', () => {
    const events = [
      makeEvent({ snapshotUrl: undefined, snapshotScore: 0, stage: 'profile' }),
      makeEvent({ id: 'pers:pers-0002', objectId: 'pers-0002' }),
    ]
    expect(listPatrolEventsForTab(events, 'all')).toHaveLength(1)
  })

  it('dedupe cùng entity — giữ bản mới nhất có snapshot', () => {
    const older = makeEvent({
      id: 'pers:pers-0001',
      objectId: 'pers-0001',
      lockedAt: '2026-08-25T08:00:00.000Z',
      violationLabel: 'cũ',
    })
    const newer = makeEvent({
      id: 'pers:pers-0001',
      objectId: 'pers-0001',
      lockedAt: '2026-08-25T12:00:00.000Z',
      violationLabel: 'mới',
    })
    const list = listPatrolEventsForTab([older, newer], 'all')
    expect(list).toHaveLength(1)
    expect(list[0]?.violationLabel).toBe('mới')
  })

  it('computePatrolTabCounts khớp listPatrolEventsForTab từng tab', () => {
    const events = [
      makeEvent({ id: 'pers:pers-0001', objectId: 'pers-0001' }),
      makeEvent({
        id: 'pers:pers-0002',
        objectId: 'pers-0002',
        stage: 'profile',
      }),
    ]
    const counts = computePatrolTabCounts(events)
    expect(counts.all).toBe(listPatrolEventsForTab(events, 'all').length)
    expect(counts.person).toBe(listPatrolEventsForTab(events, 'person').length)
    expect(counts.identity).toBe(listPatrolEventsForTab(events, 'identity').length)
  })
})
