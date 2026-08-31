import { describe, expect, it } from 'vitest'

import type { PatrolEvent } from '../data/patrolTypes'
import {
  dedupePatrolEventsByMasterEntity,
  patrolEventMasterEntityKey,
  patrolWorkforceEventTitle,
  resolvePatrolAppearanceSubjectId,
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
    const event = makeEvent({ objectId: 'OBJ-0008', trackWorkerId: 'tk-12' })
    expect(resolvePatrolPersonStage(event)).toBe('person')
    expect(
      patrolWorkforceEventTitle(event.type, event.objectId, event.objectLabel, event.trackWorkerId),
    ).toBe('Người')
  })

  it('mã tk nằm ở objectId cũng là Người', () => {
    const event = makeEvent({ objectId: 'tk-12' })
    expect(resolvePatrolPersonStage(event)).toBe('person')
  })

  it('legacy sgc-* vẫn là Người', () => {
    const event = makeEvent({ objectId: 'OBJ-0008', trackWorkerId: 'sgc-12' })
    expect(resolvePatrolPersonStage(event)).toBe('person')
  })

  it('mã pers-* từ SQLite day card → Người, không lộ mã kỹ thuật', () => {
    const event = makeEvent({
      id: 'pers:pers-0007',
      objectId: 'pers-0007',
      stage: undefined,
    })
    expect(resolvePatrolPersonStage(event)).toBe('person')
    expect(patrolEventMasterEntityKey(event)).toBe('pers-0007')
  })

  it('khớp thư viện mặt → Định danh, tiêu đề hiện tên', () => {
    const event = makeEvent({ objectId: 'p-102', objectLabel: 'Nguyễn Văn Trung' })
    expect(resolvePatrolPersonStage(event)).toBe('profile')
    expect(
      patrolWorkforceEventTitle(event.type, event.objectId, event.objectLabel, event.trackWorkerId),
    ).toBe('Nguyễn Văn Trung')
  })

  it('stage object từ SQLite vẫn lên profile khi đã khớp gallery', () => {
    const event = makeEvent({
      id: 'obj:OBJ-0099',
      objectId: 'p-102',
      objectLabel: 'Duncan',
      violationLabel: 'Duncan',
      stage: 'object',
    })
    expect(resolvePatrolPersonStage(event)).toBe('profile')
  })

  it('tin stage person/object từ server khi chưa có dấu hiệu định danh', () => {
    expect(resolvePatrolPersonStage(makeEvent({ stage: 'person', objectId: 'pers-1' }))).toBe('person')
    expect(resolvePatrolPersonStage(makeEvent({ stage: 'object', objectId: 'OBJ-1' }))).toBe('object')
  })
})

describe('gộp bản ghi theo người, không theo mã track', () => {
  it('một người đã định danh chỉ ra một dòng dù mang nhiều mã tk', () => {
    const first = makeEvent({
      id: 'e-1',
      objectId: 'p-102',
      trackWorkerId: 'tk-12',
      lockedAt: '2026-08-25T10:00:00Z',
    })
    const second = makeEvent({
      id: 'e-2',
      objectId: 'p-102',
      trackWorkerId: 'tk-77',
      lockedAt: '2026-08-25T10:05:00Z',
    })

    expect(patrolEventMasterEntityKey(first)).toBe(patrolEventMasterEntityKey(second))

    const merged = dedupePatrolEventsByMasterEntity([first, second])
    expect(merged).toHaveLength(1)
    expect(merged[0].id).toBe('e-2')
  })

  it('mã hồ sơ thắng tk để bảng sự kiện khớp bản đồ nhiệt', () => {
    const withTk = makeEvent({ objectId: 'p-102', trackWorkerId: 'tk-12' })
    expect(patrolEventMasterEntityKey(withTk)).toBe('P-102')
  })

  it('chưa có hồ sơ thì vẫn gộp theo tk', () => {
    const a = makeEvent({ id: 'e-1', objectId: 'OBJ-0008', trackWorkerId: 'tk-12' })
    const b = makeEvent({ id: 'e-2', objectId: 'OBJ-0009', trackWorkerId: 'tk-12' })
    expect(patrolEventMasterEntityKey(a)).toBe('TK-12')
    expect(dedupePatrolEventsByMasterEntity([a, b])).toHaveLength(1)
  })

  it('legacy sgc-* vẫn gộp theo mã', () => {
    const a = makeEvent({ id: 'e-1', objectId: 'OBJ-0008', trackWorkerId: 'sgc-12' })
    const b = makeEvent({ id: 'e-2', objectId: 'OBJ-0009', trackWorkerId: 'sgc-12' })
    expect(patrolEventMasterEntityKey(a)).toBe('SGC-12')
    expect(dedupePatrolEventsByMasterEntity([a, b])).toHaveLength(1)
  })

  it('hai người khác hồ sơ không bị gộp', () => {
    const a = makeEvent({ id: 'e-1', objectId: 'p-102' })
    const b = makeEvent({ id: 'e-2', objectId: 'p-205' })
    expect(dedupePatrolEventsByMasterEntity([a, b])).toHaveLength(2)
  })
})

describe('resolvePatrolAppearanceSubjectId — popup lịch sử', () => {
  it('ưu tiên pers từ day card dù objectId đã promote gallery', () => {
    const event = makeEvent({
      id: 'pers:pers-0042',
      objectId: 'p-DUNCAN',
      objectLabel: 'Duncan',
      violationLabel: 'Duncan',
      stage: 'profile',
    })
    expect(resolvePatrolAppearanceSubjectId(event)).toBe('pers-0042')
  })

  it('giữ obj-* cho thẻ Đối tượng — không fallback tk', () => {
    const event = makeEvent({
      id: 'obj:OBJ-0007',
      objectId: 'OBJ-0007',
      trackWorkerId: 'tk-12',
      stage: 'object',
    })
    expect(resolvePatrolAppearanceSubjectId(event)).toBe('OBJ-0007')
  })

  it('không tra lịch sử qua mã gallery khi thiếu day card', () => {
    const event = makeEvent({
      id: 'live-ev-99',
      objectId: 'p-DUNCAN',
      trackWorkerId: 'tk-12',
      stage: 'profile',
    })
    expect(resolvePatrolAppearanceSubjectId(event)).toBe('p-DUNCAN')
    expect(resolvePatrolAppearanceSubjectId(event)).not.toBe('tk-12')
  })
})
