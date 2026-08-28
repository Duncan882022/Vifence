import { describe, expect, it } from 'vitest'
import {
  readPatrolFlightModeFromMetrics,
  resolvePatrolFlycamGateFlags,
} from './patrolFlightMode'

describe('readPatrolFlightModeFromMetrics', () => {
  it('đọc flight_mode từ bucket patrol (VMS DR-*)', () => {
    expect(
      readPatrolFlightModeFromMetrics({
        patrol: { flight_mode: 'proximity', person_count: 2 },
      }),
    ).toBe('proximity')
  })

  it('fallback bucket ppe cho camera legacy', () => {
    expect(
      readPatrolFlightModeFromMetrics({
        ppe: { flight_mode: 'aerial' },
      }),
    ).toBe('aerial')
  })

  it('trả null khi thiếu metrics', () => {
    expect(readPatrolFlightModeFromMetrics(undefined)).toBeNull()
    expect(readPatrolFlightModeFromMetrics({})).toBeNull()
  })
})

describe('resolvePatrolFlycamGateFlags', () => {
  it('proximity bật gate bodycam-like, tắt aerial silhouette', () => {
    expect(resolvePatrolFlycamGateFlags('DR-03', 'proximity')).toEqual({
      flycam: false,
      proximityFlycam: true,
    })
  })

  it('aerial giữ gate silhouette tầm cao', () => {
    expect(resolvePatrolFlycamGateFlags('DR-03', 'aerial')).toEqual({
      flycam: true,
      proximityFlycam: false,
    })
  })
})
