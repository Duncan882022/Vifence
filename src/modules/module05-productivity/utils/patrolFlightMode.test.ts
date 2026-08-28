import { describe, expect, it, vi, beforeEach } from 'vitest'
import {
  readPatrolFlightModeFromMetrics,
  resolveEffectivePatrolFlightMode,
  resolvePatrolFlycamGateFlags,
} from './patrolFlightMode'
import { getPatrolFlightMode } from '@/services/patrolFlightModeBridge'

vi.mock('@/services/patrolFlightModeBridge', () => ({
  getPatrolFlightMode: vi.fn(() => 'proximity' as const),
}))

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

  it('HC-* không bật flycam gate', () => {
    expect(resolvePatrolFlycamGateFlags('HC-02', null)).toEqual({
      flycam: false,
      proximityFlycam: false,
    })
  })
})

describe('resolveEffectivePatrolFlightMode', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ưu tiên metrics snapshot', () => {
    expect(
      resolveEffectivePatrolFlightMode('DR-03', { patrol: { flight_mode: 'aerial' } }),
    ).toBe('aerial')
  })

  it('fallback bridge TTL khi metrics thiếu (DR-*)', () => {
    expect(resolveEffectivePatrolFlightMode('DR-03', null)).toBe('proximity')
  })

  it('mặc định aerial khi không có metrics lẫn bridge', () => {
    vi.mocked(getPatrolFlightMode).mockReturnValueOnce(null)
    expect(resolveEffectivePatrolFlightMode('DR-03', null)).toBe('aerial')
  })

  it('HC-* không fallback bridge', () => {
    expect(resolveEffectivePatrolFlightMode('HC-01', null)).toBeNull()
  })
})
