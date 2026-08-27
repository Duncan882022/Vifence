import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  applyPatrolUnifiedLiveRouting,
  mergePatrolCamerasWithVisionLive,
} from './patrolHelmetStreams'

describe('patrolHelmetStreams unified routing', () => {
  const envBackup = { ...import.meta.env }

  beforeEach(() => {
    vi.stubEnv('VITE_MEDIAMTX_WEBRTC_URL', 'https://example.test/mediamtx/webrtc')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    Object.assign(import.meta.env, envBackup)
  })

  it('applyPatrolUnifiedLiveRouting gỡ wsUrl và fallback VMS cho HC/DR', () => {
    const [row] = applyPatrolUnifiedLiveRouting([
      {
        id: 'HC-01',
        streamUrl: 'https://example.test/hc-01.m3u8',
        whepUrl: 'https://example.test/hc-01/whep',
        wsUrl: 'wss://legacy/jsmpeg',
        streamFallbackUrl: 'https://example.test/stream/HC-01/index.m3u8',
      },
    ])
    expect(row.wsUrl).toBeUndefined()
    expect(row.streamFallbackUrl).toBeUndefined()
    expect(row.whepUrl).toBeDefined()
  })

  it('mergePatrolCamerasWithVisionLive bỏ qua khi MediaMTX đã cấu hình', () => {
    const cameras = [{ id: 'HC-01', streamUrl: 'https://a/hls.m3u8' }]
    const merged = mergePatrolCamerasWithVisionLive(cameras, [
      { id: 'HC-01', wsUrl: 'wss://vision/ws' },
    ])
    expect(merged).toEqual(cameras)
  })
})
