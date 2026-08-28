import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { buildPatrolLiveWsUrl } from './patrolLiveFeed.service'

describe('buildPatrolLiveWsUrl', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => 'test-token'),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('builds wss URL with cameras and token', () => {
    const url = buildPatrolLiveWsUrl('https://api.example.test', ['HC-01', 'DR-03'])
    expect(url).toContain('wss://api.example.test/ws/patrol/live')
    expect(url).toContain('cameras=HC-01%2CDR-03')
    expect(url).toContain('token=test-token')
  })
})
