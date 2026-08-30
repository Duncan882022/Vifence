import { beforeEach, describe, expect, it } from 'vitest'

import type { PatrolEvent } from '../data/patrolTypes'
import {
  assignPatrolManualIdentity,
  getPatrolManualIdentityForPatrolEvent,
} from '../services/patrolManualIdentity.service'
import { applyManualIdentityToPatrolEvent } from './patrolManualIdentityUi'

function makeEvent(over: Partial<PatrolEvent>): PatrolEvent {
  return {
    id: 'pers:pers-0001',
    type: 'PERSON_DETECTED',
    cameraId: 'HC-02',
    cameraName: 'Cam Sau',
    zoneId: 'z-1',
    zoneName: 'Khu A',
    objectId: 'pers-0001',
    objectLabel: 'Unknown',
    violationLabel: 'Người',
    startedAt: '2026-08-25T10:00:00Z',
    lockedAt: '2026-08-25T10:00:00Z',
    endedAt: null,
    durationSeconds: null,
    status: 'LOCKED',
    confidence: 0.7,
    gps: { lat: 0, lng: 0 },
    stage: 'person',
    ...over,
  } as PatrolEvent
}

describe('applyManualIdentityToPatrolEvent', () => {
  beforeEach(() => {
    assignPatrolManualIdentity({
      objectKey: 'pers-0002',
      workerId: 'P-DUNCAN',
      workerName: 'Duncan',
      unitName: 'SGC',
    })
  })

  it('giữ pers-* khi gán tay — không thay bằng mã gallery', () => {
    const event = makeEvent({
      id: 'pers:pers-0002',
      objectId: 'pers-0002',
    })
    const next = applyManualIdentityToPatrolEvent(event)
    expect(next.objectId).toBe('pers-0002')
    expect(next.violationLabel).toBe('Duncan')
  })

  it('không dán Duncan lên pers khác chỉ vì alias map lỏng', () => {
    const event = makeEvent({
      id: 'pers:pers-0099',
      objectId: 'pers-0099',
      objectLabel: 'Unknown',
    })
    expect(getPatrolManualIdentityForPatrolEvent(event)).toBeNull()
    expect(applyManualIdentityToPatrolEvent(event).objectLabel).toBe('Unknown')
  })
})
