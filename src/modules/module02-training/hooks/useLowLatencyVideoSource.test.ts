import { describe, expect, it } from 'vitest'
import { getWhepDisplayWallclockMs } from './useLowLatencyVideoSource'
import { getPatrolWhepDisplayLagMs } from '@/services/patrolRuntimeBridge'

describe('getWhepDisplayWallclockMs', () => {
  it('trừ lag WHEP adaptive khỏi wallclock hiện tại', () => {
    const now = 1_788_594_328_920
    expect(getWhepDisplayWallclockMs(now)).toBe(now - getPatrolWhepDisplayLagMs())
  })

  it('lag WHEP nhỏ hơn buffer HLS patrol', () => {
    expect(getPatrolWhepDisplayLagMs()).toBeLessThan(5000)
  })
})
