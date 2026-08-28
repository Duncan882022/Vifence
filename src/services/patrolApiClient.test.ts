import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/modules/dao-tao-tuan-thu/services/ghpagesDemo.service', () => ({
  IS_DEMO_AUTH: true,
}))

vi.mock('@/modules/module03-safety/services/vmsDetections.service', () => ({
  getVmsBackendUrl: () => 'https://example.test',
}))

vi.mock('@/modules/module02-training/services/mobileAiBackend.service', () => ({
  getMobileAiBackendUrl: () => '',
}))

describe('ensurePatrolAuth', () => {
  const storage = new Map<string, string>()

  beforeEach(() => {
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value) },
      removeItem: (key: string) => { storage.delete(key) },
      clear: () => { storage.clear() },
    })
    vi.stubGlobal('window', {
      setTimeout: (fn: () => void) => {
        fn()
        return 0
      },
      clearTimeout: () => {},
    })
    vi.stubGlobal('fetch', vi.fn())
    vi.stubEnv('VITE_PATROL_DEMO_USERNAME', 'admin')
    vi.stubEnv('VITE_PATROL_DEMO_PASSWORD', 'admin123')
    storage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
    storage.clear()
  })

  it('auto signin khi build có VITE_PATROL_DEMO_* dù không bật IS_DEMO_AUTH guard', async () => {
    vi.doUnmock('@/modules/dao-tao-tuan-thu/services/ghpagesDemo.service')
    vi.resetModules()
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        ok: true,
        access_token: 'build-jwt',
        token_type: 'bearer',
        user: { username: 'admin', role: 'admin' },
      }),
    } as Response)

    const { ensurePatrolAuth } = await import('./patrolApiClient')
    const authed = await ensurePatrolAuth()
    expect(authed).toBe(true)
    expect(storage.get('vifence_patrol_access_token')).toBe('build-jwt')
  })

  it('tự signin và gửi Bearer khi demo mode chưa có token', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          access_token: 'demo-jwt',
          token_type: 'bearer',
          user: { username: 'admin', role: 'admin' },
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ ok: true, items: [] }),
      } as Response)

    const { ensurePatrolAuth, fetchPatrol } = await import('./patrolApiClient')

    const authed = await ensurePatrolAuth()
    expect(authed).toBe(true)
    expect(storage.get('vifence_patrol_access_token')).toBe('demo-jwt')

    await fetchPatrol('/patrol/day/events')

    expect(fetch).toHaveBeenCalledTimes(2)
    const bundleCall = vi.mocked(fetch).mock.calls[1]
    expect(bundleCall[0]).toBe('https://example.test/patrol/day/events')
    const headers = (bundleCall[1]?.headers ?? {}) as Record<string, string>
    expect(headers.Authorization).toBe('Bearer demo-jwt')
  })
})
