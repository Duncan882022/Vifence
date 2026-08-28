import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { buildPatrolCamerasLive } from './buildPatrolCamerasLive'

describe('buildPatrolCamerasLive', () => {
  const envBackup = { ...import.meta.env }

  beforeEach(() => {
    vi.stubEnv('VITE_MEDIAMTX_WEBRTC_URL', 'https://example.test/mediamtx/webrtc')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    Object.assign(import.meta.env, envBackup)
  })

  it('MediaMTX — gỡ wsUrl, gắn online từ perCamera', () => {
    const [row] = buildPatrolCamerasLive(
      [],
      [{
        camera_id: 'HC-01',
        stream_online: true,
        person_count: 0,
        identified_workers: 0,
        person_events_today: 0,
      }],
    )
    expect(row.id).toBe('HC-01')
    expect(row.wsUrl).toBeUndefined()
    expect(row.status).toBe('online')
  })
})
