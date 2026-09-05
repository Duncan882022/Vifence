import { describe, expect, it } from 'vitest'
import { getWhepDisplayWallclockMs } from './useLowLatencyVideoSource'
import { WHEP_PLAYBACK_LAG_MS } from '@/services/patrolRuntimeBridge'

describe('getWhepDisplayWallclockMs', () => {
  it('trừ lag WHEP khỏi wallclock hiện tại', () => {
    const now = 1_788_594_328_920
    expect(getWhepDisplayWallclockMs(now)).toBe(now - WHEP_PLAYBACK_LAG_MS)
  })

  it('lag WHEP nhỏ hơn buffer HLS patrol', () => {
    expect(WHEP_PLAYBACK_LAG_MS).toBeLessThan(5000)
  })
})
