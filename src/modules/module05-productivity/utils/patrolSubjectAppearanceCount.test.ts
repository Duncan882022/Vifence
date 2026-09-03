import { describe, expect, it } from 'vitest'

import type { PatrolEvent } from '../data/patrolTypes'
import type { PatrolDayPresence } from '../services/patrolDayEvents.service'
import { resolvePatrolPersonCardDisplay } from './patrolManualIdentityUi'
import {
  buildPatrolSubjectAppearanceCountLookup,
  resolvePatrolEventAppearanceHistoryCount,
} from './patrolSubjectAppearanceCount'

function makeEvent(over: Partial<PatrolEvent>): PatrolEvent {
  return {
    id: 'obj:obj-20260826-0001',
    type: 'PERSON_DETECTED',
    cameraId: 'HC-02',
    cameraName: 'Cam Sau',
    zoneId: 'z-1',
    zoneName: 'Khu A',
    objectId: 'obj-20260826-0001',
    objectLabel: 'Đối tượng',
    violationLabel: 'Đối tượng',
    startedAt: '2026-08-26T10:00:00Z',
    lockedAt: '2026-08-26T10:05:00Z',
    endedAt: null,
    durationSeconds: null,
    status: 'LOCKED',
    confidence: 0.7,
    gps: { lat: 0, lng: 0 },
    stage: 'object',
    ...over,
  } as PatrolEvent
}

function makePresence(over: Partial<PatrolDayPresence>): PatrolDayPresence {
  return {
    id: 1,
    subjectId: 'obj-20260826-0001',
    cameraId: 'HC-02',
    zoneId: 'z-1',
    startedAt: 1_700_000_000,
    endedAt: 1_700_000_100,
    gpsLat: 0,
    gpsLng: 0,
    presenceSeq: 1,
    tier: 'object',
    displayName: 'Đối tượng',
    sourceCameras: ['HC-02'],
    ...over,
  }
}

describe('resolvePatrolPersonCardDisplay — object', () => {
  it('hiện objectId thay Unknown', () => {
    const event = makeEvent({ trackWorkerId: 'tk-12' })
    const card = resolvePatrolPersonCardDisplay(event)
    expect(card.subjectLabel).toBe('obj-20260826-0001')
    expect(card.title).toBe('obj-20260826-0001')
    expect(card.subjectLabel).not.toBe('Unknown')
  })
})

describe('patrolSubjectAppearanceCount', () => {
  it('đếm lượt presence theo subject_id', () => {
    const lookup = buildPatrolSubjectAppearanceCountLookup([
      makePresence({ id: 1, presenceSeq: 1 }),
      makePresence({ id: 2, presenceSeq: 2, endedAt: 1_700_000_200 }),
      makePresence({ id: 3, subjectId: 'pers-0002', tier: 'person', presenceSeq: 1 }),
    ])
    expect(lookup.get('obj-20260826-0001')).toBe(2)
    expect(lookup.get('pers-0002')).toBe(1)
  })

  it('map count vào event qua appearance subject id', () => {
    const lookup = buildPatrolSubjectAppearanceCountLookup([
      makePresence({ id: 1 }),
      makePresence({ id: 2, presenceSeq: 2 }),
    ])
    expect(resolvePatrolEventAppearanceHistoryCount(makeEvent({}), lookup)).toBe(2)
  })

  it('pers day card — cùng khóa tra lịch sử', () => {
    const lookup = buildPatrolSubjectAppearanceCountLookup([
      makePresence({ subjectId: 'pers-0007', tier: 'person' }),
      makePresence({ id: 2, subjectId: 'pers-0007', tier: 'person', presenceSeq: 2 }),
    ])
    const event = makeEvent({
      id: 'pers:pers-0007',
      objectId: 'pers-0007',
      stage: 'person',
      objectLabel: 'Unknown',
      violationLabel: 'Người',
    })
    expect(resolvePatrolEventAppearanceHistoryCount(event, lookup)).toBe(2)
  })
})
