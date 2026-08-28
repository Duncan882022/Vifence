import { describe, expect, it, vi } from 'vitest'
import { createPlaybackStallChecker, hasDecodedVideoFrame } from './videoPlaybackStall'

function mockVideo(partial: Partial<HTMLVideoElement>): HTMLVideoElement {
  return partial as HTMLVideoElement
}

describe('hasDecodedVideoFrame', () => {
  it('cần width và readyState đủ', () => {
    expect(hasDecodedVideoFrame(mockVideo({ videoWidth: 0, readyState: 4 }))).toBe(false)
    expect(hasDecodedVideoFrame(mockVideo({ videoWidth: 640, readyState: 2 }))).toBe(true)
  })
})

describe('createPlaybackStallChecker', () => {
  it('báo stall khi currentTime không đổi quá lâu', () => {
    const checker = createPlaybackStallChecker()
    let now = 1000
    const video = mockVideo({
      videoWidth: 1280,
      readyState: 4,
      paused: false,
      ended: false,
      currentTime: 5,
    })

    vi.spyOn(performance, 'now').mockImplementation(() => now)

    expect(checker.tick(video, true)).toBe('ok')
    now += 4001
    expect(checker.tick(video, true)).toBe('ok')
    now += 4001
    expect(checker.tick(video, true)).toBe('stall')
  })

  it('reset khi currentTime tiến', () => {
    const checker = createPlaybackStallChecker()
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)

    const video = mockVideo({
      videoWidth: 640,
      readyState: 4,
      paused: false,
      ended: false,
      currentTime: 1,
    })
    checker.tick(video, true)
    now += 5000
    video.currentTime = 1.5
    expect(checker.tick(video, true)).toBe('ok')
    now += 5000
    expect(checker.tick(video, true)).toBe('ok')
  })
})
