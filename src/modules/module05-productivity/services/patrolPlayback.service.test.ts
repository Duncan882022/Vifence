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
    expect(eventRecord?.videoUrl).toContain('/get?')
  })
})
