import { describe, expect, it } from 'vitest'
import type { PatrolDayPresence } from '../services/patrolDayEvents.service'
import { buildHelmetDetectCountsFromPresences } from './patrolHelmetDetectCounts'

function makePresence(over: Partial<PatrolDayPresence>): PatrolDayPresence {
  return {
    id: 1,
    subjectId: 'pers-0001',
    cameraId: 'HC-01',
    zoneId: 'z-1',
    startedAt: 1_700_000_000,
    endedAt: 1_700_000_030,
    gpsLat: 10.77,
    gpsLng: 106.65,
    presenceSeq: 1,
    tier: 'person',
    displayName: 'pers-0001',
    sourceCameras: ['HC-01'],
    ...over,
  }
}

describe('buildHelmetDetectCountsFromPresences', () => {
  it('đếm unique subjectId theo tier và camera', () => {
    const presences = [
      makePresence({ subjectId: 'pers-0001', tier: 'person', cameraId: 'HC-01' }),
      makePresence({ id: 2, subjectId: 'pers-0002', tier: 'person', cameraId: 'HC-01' }),
      makePresence({ id: 3, subjectId: 'iden-0001', tier: 'identity', cameraId: 'HC-01' }),
      makePresence({ id: 4, subjectId: 'pers-0003', tier: 'person', cameraId: 'HC-02', sourceCameras: ['HC-02'] }),
    ]
    const counts = buildHelmetDetectCountsFromPresences(presences, ['HC-01', 'HC-02'])
    expect(counts['HC-01']).toEqual({ person: 2, identity: 1, total: 3 })
    expect(counts['HC-02']).toEqual({ person: 1, identity: 0, total: 1 })
  })

  it('sourceCameras — presence gán vào camera phụ', () => {
    const presences = [
      makePresence({
        cameraId: 'HC-02',
        sourceCameras: ['HC-01', 'HC-02'],
        subjectId: 'pers-0099',
      }),
    ]
    const counts = buildHelmetDetectCountsFromPresences(presences, ['HC-01'])
    expect(counts['HC-01'].person).toBe(1)
  })

  it('bỏ qua tier object', () => {
    const presences = [
      makePresence({ tier: 'object', subjectId: 'obj-20260831-0001' }),
    ]
    const counts = buildHelmetDetectCountsFromPresences(presences, ['HC-01'])
    expect(counts['HC-01']).toEqual({ person: 0, identity: 0, total: 0 })
  })
})
