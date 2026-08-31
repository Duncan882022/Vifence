import { describe, expect, it } from 'vitest'
import { computeFaceScanRingProgress } from './patrolFaceScanProgress'

describe('patrolFaceScanProgress', () => {
  it('returns 1 when complete', () => {
    expect(computeFaceScanRingProgress(3, 4, 0.5, true)).toBe(1)
  })

  it('adds partial hold progress on current slot', () => {
    expect(computeFaceScanRingProgress(1, 4, 0.5, false)).toBeCloseTo(0.375)
    expect(computeFaceScanRingProgress(0, 4, 1, false)).toBeCloseTo(0.25)
  })

  it('caps at 1 before complete', () => {
    expect(computeFaceScanRingProgress(4, 4, 0.8, false)).toBe(1)
  })
})
