import { describe, expect, it } from 'vitest'

import type { PatrolEvent } from '../data/patrolMockData'
import {
  patrolWorkforceEventTitle,
  resolvePatrolPersonStage,
} from './patrolWorkforceEventLabels'

function makeEvent(over: Partial<PatrolEvent>): PatrolEvent {
  return {
    id: 'e-1',
    type: 'PERSON_DETECTED',
    cameraId: 'HC-02',
    cameraName: 'Cam Sau',
    zoneId: 'z-1',
    zoneName: 'Khu A',
    objectId: '',
    objectLabel: '',
    violationLabel: '',
    startedAt: '2026-08-25T10:00:00Z',
    lockedAt: '2026-08-25T10:00:00Z',
    endedAt: null,
    durationSeconds: null,
    status: 'OPEN',
    confidence: 0.7,
    gps: { lat: 0, lng: 0 },
    ...over,
  } as PatrolEvent
}

describe('ba tầng nhận diện HC-02', () => {
  it('quay lưng, chưa từng thấy mặt → Đối tượng', () => {
    const event = makeEvent({ objectId: 'OBJ-0007', objectLabel: 'OBJ-0007' })
    expect(resolvePatrolPersonStage(event)).toBe('object')
    expect(
      patrolWorkforceEventTitle(event.type, event.objectId, event.objectLabel, event.trackWorkerId),
    ).toBe('Đối tượng')
  })

  it('đủ mặt để nhận diện nhưng chưa có trong thư viện → Người', () => {
    const event = makeEvent({ objectId: 'OBJ-0008', trackWorkerId: 'sgc-12' })
    expect(resolvePatrolPersonStage(event)).toBe('person')
    expect(
      patrolWorkforceEventTitle(event.type, event.objectId, event.objectLabel, event.trackWorkerId),
    ).toBe('Người')
  })

  it('mã sgc nằm ở objectId cũng là Người', () => {
    const event = makeEvent({ objectId: 'sgc-12' })
    expect(resolvePatrolPersonStage(event)).toBe('person')
  })

  it('khớp thư viện mặt → Định danh, tiêu đề hiện tên', () => {
    const event = makeEvent({ objectId: 'p-102', objectLabel: 'Nguyễn Văn Trung' })
    expect(resolvePatrolPersonStage(event)).toBe('profile')
    expect(
      patrolWorkforceEventTitle(event.type, event.objectId, event.objectLabel, event.trackWorkerId),
    ).toBe('Nguyễn Văn Trung')
  })

  it('đã khớp thư viện thì không tụt về Người dù còn mã sgc', () => {
    const event = makeEvent({ objectId: 'p-102', trackWorkerId: 'sgc-12' })
    expect(resolvePatrolPersonStage(event)).toBe('profile')
  })
})
