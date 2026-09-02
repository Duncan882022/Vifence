import { describe, expect, it, beforeEach } from 'vitest'
import {
  getPatrolLiveRoiDelayMs,
  getPatrolClientServerSkewMs,
  setPatrolRuntimeFromPayload,
  updatePatrolClientServerSkew,
} from '@/services/patrolRuntimeBridge'

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
})
