import { describe, expect, it, beforeEach } from 'vitest'
import {
  getPatrolLiveRoiDelayMs,
  getPatrolClientServerSkewMs,
  getPatrolWhepDisplayLagMs,
  getPatrolWhepDisplayWallclockMs,
  setPatrolRuntimeFromPayload,
  updatePatrolClientServerSkew,
  updatePatrolWhepDisplayLag,
} from '@/services/patrolRuntimeBridge'
import { WHEP_DISPLAY_WALLCLOCK_LAG_MS } from '@/modules/module05-productivity/data/patrolHelmetScope'

describe('patrolRuntimeBridge', () => {
  beforeEach(() => {
    setPatrolRuntimeFromPayload({
      live_roi_delay_ms: 4200,
      server_time_ms: Date.now(),
    })
  })

  it('getPatrolLiveRoiDelayMs đọc từ payload BE', () => {
    expect(getPatrolLiveRoiDelayMs()).toBe(4200)
  })

  it('updatePatrolClientServerSkew EMA', () => {
    const base = Date.now()
    updatePatrolClientServerSkew(base - 100)
    expect(getPatrolClientServerSkewMs()).toBeGreaterThan(10)
    expect(getPatrolClientServerSkewMs()).toBeLessThan(120)
  })

  it('updatePatrolWhepDisplayLag học từ frame aligned', () => {
    const now = Date.now()
    updatePatrolWhepDisplayLag(now - 620, 'aligned')
    expect(getPatrolWhepDisplayLagMs()).toBeGreaterThan(WHEP_DISPLAY_WALLCLOCK_LAG_MS)
  })

  it('getPatrolWhepDisplayWallclockMs trừ lag adaptive', () => {
    const now = 1_788_594_328_920
    expect(getPatrolWhepDisplayWallclockMs(now)).toBe(now - getPatrolClientServerSkewMs() - getPatrolWhepDisplayLagMs())
  })
})
