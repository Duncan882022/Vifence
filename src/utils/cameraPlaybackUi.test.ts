import { describe, expect, it } from 'vitest'
import { resolvePlaybackTarget } from './cameraPlaybackUi'
import type { CameraPlaybackRecord } from '@/types/cameraPlayback'

const continuous: CameraPlaybackRecord = {
  id: 'seg-1',
  name: '08:00 · 5 phút',
  startTime: '2026-08-28T08:00:00+07:00',
  endTime: '2026-08-28T08:05:00+07:00',
  type: 'continuous',
  videoUrl: 'https://playback.test/get?path=hc-02',
}

const event: CameraPlaybackRecord = {
  id: 'ev-1',
  name: 'Sự kiện',
  startTime: '2026-08-28T08:02:30+07:00',
  endTime: '2026-08-28T08:03:00+07:00',
  type: 'event',
  videoUrl: 'https://playback.test/get?path=hc-02&start=bad',
}

describe('resolvePlaybackTarget', () => {
  it('giữ băng liên tục khi đã chọn continuous', () => {
    expect(resolvePlaybackTarget(continuous, [continuous, event])).toEqual(continuous)
  })

  it('snap sự kiện vào băng liên tục chứa thời điểm', () => {
    const target = resolvePlaybackTarget(event, [continuous, event])
    expect(target?.id).toBe('seg-1')
    expect(target?.videoUrl).toBe(continuous.videoUrl)
    expect(target?.seekSec).toBe(150)
  })

  it('fallback clip sự kiện khi không có băng liên tục', () => {
    expect(resolvePlaybackTarget(event, [event])).toEqual(event)
  })
})
