import { describe, expect, it } from 'vitest'
import { computeFaceScanRingProgress } from './patrolFaceScanProgress'

describe('patrolFaceScanProgress', () => {
  const required = 5

  it('returns 1 when complete', () => {
    expect(computeFaceScanRingProgress(4, required, 0.5, true)).toBe(1)
  })

  it('adds partial hold progress on current slot', () => {
    expect(computeFaceScanRingProgress(1, required, 0.5, false)).toBeCloseTo(0.3)
    expect(computeFaceScanRingProgress(0, required, 1, false)).toBeCloseTo(0.2)
  })

  it('adds approach progress while turning head', () => {
    expect(computeFaceScanRingProgress(0, required, 0, false, 0.5)).toBeCloseTo(0.1)
    expect(computeFaceScanRingProgress(1, required, 0, false, 0.4)).toBeCloseTo(0.28)
  })

  it('prefers hold over approach when both present', () => {
    expect(computeFaceScanRingProgress(0, required, 0.6, false, 0.8)).toBeCloseTo(0.12)
  })

  it('caps at 1 before complete', () => {
    expect(computeFaceScanRingProgress(5, required, 0.8, false)).toBe(1)
  })
})
