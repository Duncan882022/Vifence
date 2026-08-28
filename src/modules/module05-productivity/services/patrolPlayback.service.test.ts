import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPatrolPlaybackFetchers } from './patrolPlayback.service'
import type { PatrolEvent } from '../data/patrolTypes'

vi.mock('../data/helmetIngest', async importOriginal => {
  const actual = await importOriginal<typeof import('../data/helmetIngest')>()
  return {
    ...actual,
    getMediaMtxPlaybackBase: () => 'https://playback.test',
    mediaMtxPathForCamera: (id: string) => id.toLowerCase(),
  }
})

describe('createPatrolPlaybackFetchers', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [],
      }),
    )
  })

  it('parse ngày từ ISO datetime panel — không ghép chuỗi lỗi', async () => {
    const events: PatrolEvent[] = [{
      id: 'ev-1',
      type: 'PERSON_DETECTED',
      cameraId: 'HC-02',
      cameraName: 'HC-02',
      zoneId: 'z1',
      zoneName: 'Zone',
      objectId: 'OBJ-1',
      objectLabel: 'Người',
      violationLabel: 'Phát hiện người',
      startedAt: '2026-08-28T14:00:00+07:00',
      lockedAt: '2026-08-28T14:01:00+07:00',
      endedAt: null,
      durationSeconds: null,
      status: 'LOCKED',
      confidence: 0.9,
      gps: { lat: 10, lng: 106 },
    }]

    const fetch = createPatrolPlaybackFetchers(events).fetchRecords
    const res = await fetch('HC-02', {
      startDate: '2026-08-28T00:00:00+07:00',
      endDate: '2026-08-28T23:59:59+07:00',
    })

    const eventRecord = res.items.find(i => i.id === 'ev-1')
    expect(eventRecord).toBeDefined()
    expect(eventRecord?.type).toBe('event')
    expect(eventRecord?.videoUrl).toContain('https://playback.test/get?')
  })

  it('băng MediaMTX — luôn dựng /get qua playback base (bỏ url nội bộ MediaMTX)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => [{
          start: '2026-08-28T09:00:49+02:00',
          duration: 12.6,
          url: 'http://217.217.253.247.nip.io/get?path=hc-01',
        }],
      }),
    )

    const fetch = createPatrolPlaybackFetchers([]).fetchRecords
    const res = await fetch('HC-01', {
      startDate: '2026-08-28T00:00:00+07:00',
      endDate: '2026-08-28T23:59:59+07:00',
    })

    expect(res.items).toHaveLength(1)
    expect(res.items[0].videoUrl).toMatch(/^https:\/\/playback\.test\/get\?/)
    expect(res.items[0].videoUrl).not.toContain('217.217.253.247')
  })

  it('404 MediaMTX — coi như không có băng, không ném lỗi', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: 'no recording segments found' }),
      }),
    )

    const fetch = createPatrolPlaybackFetchers([]).fetchRecords
    const res = await fetch('HC-02', {
      startDate: '2026-08-27',
      endDate: '2026-08-27',
    })

    expect(res.items).toEqual([])
  })

  it('ISO UTC sau nửa đêm VN — map đúng ngày lịch VN', async () => {
    const events: PatrolEvent[] = [{
      id: 'ev-late',
      type: 'PERSON_DETECTED',
      cameraId: 'HC-02',
      cameraName: 'HC-02',
      zoneId: 'z1',
      zoneName: 'Zone',
      objectId: 'OBJ-1',
      objectLabel: 'Người',
      violationLabel: 'Phát hiện người',
      startedAt: '2026-08-28T17:30:00.000Z',
      lockedAt: '2026-08-28T17:30:00.000Z',
      endedAt: null,
      durationSeconds: null,
      status: 'LOCKED',
      confidence: 0.9,
      gps: { lat: 10, lng: 106 },
    }]

    const fetch = createPatrolPlaybackFetchers(events).fetchRecords
    const res28 = await fetch('HC-02', {
      startDate: '2026-08-28T00:00:00+07:00',
      endDate: '2026-08-28T23:59:59+07:00',
    })
    expect(res28.items.find(i => i.id === 'ev-late')).toBeUndefined()

    const res29 = await fetch('HC-02', {
      startDate: '2026-08-29T00:00:00+07:00',
      endDate: '2026-08-29T23:59:59+07:00',
    })
    expect(res29.items.find(i => i.id === 'ev-late')).toBeDefined()
  })
})
