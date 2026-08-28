import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  fetchPatrolHealthStreamMap,
  fetchPatrolHelmetAggregateMetrics,
} from './patrolLiveEvents.service'

describe('fetchPatrolHealthStreamMap', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('đọc stream_online từ /health cho DR-03', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        status: 'ok',
        cameras: {
          'DR-03': { stream_online: true },
          'HC-01': { stream_online: false },
        },
      }),
    } as Response)

    const map = await fetchPatrolHealthStreamMap(['DR-03', 'HC-01'], 'https://example.test')
    expect(map.get('DR-03')).toBe(true)
    expect(map.get('HC-01')).toBe(false)
  })
})

describe('fetchPatrolHelmetAggregateMetrics health merge', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('DR-03 online qua /health dù /patrol/metrics trả 401', async () => {
    vi.mocked(fetch).mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/health')) {
        return {
          ok: true,
          json: async () => ({
            status: 'ok',
            cameras: { 'DR-03': { stream_online: true } },
          }),
        } as Response
      }
      if (url.includes('/patrol/metrics')) {
        return { ok: false, status: 401 } as Response
      }
      return { ok: false, status: 404 } as Response
    })

    const snapshot = await fetchPatrolHelmetAggregateMetrics(['DR-03'], 'https://example.test')
    expect(snapshot).not.toBeNull()
    expect(snapshot?.cameras).toHaveLength(1)
    expect(snapshot?.cameras[0]?.camera_id).toBe('DR-03')
    expect(snapshot?.cameras[0]?.stream_online).toBe(true)
    expect(snapshot?.stream_online).toBe(true)
  })
})
