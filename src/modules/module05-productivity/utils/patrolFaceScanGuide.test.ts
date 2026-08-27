import { describe, expect, it } from 'vitest'
import { guidanceForSlot, poseHintMatchesSlot } from './patrolFaceScanGuide'

describe('patrolFaceScanGuide', () => {
  it('maps head pose to enrollment slots', () => {
    expect(poseHintMatchesSlot('front', 1)).toBe(true)
    expect(poseHintMatchesSlot('left', 2)).toBe(true)
    expect(poseHintMatchesSlot('right', 3)).toBe(true)
    expect(poseHintMatchesSlot('left', 1)).toBe(false)
  })

  it('exposes simple step labels', () => {
    expect(guidanceForSlot(1)).toContain('Bước 1')
    expect(guidanceForSlot(2)).toContain('TRÁI')
    expect(guidanceForSlot(3)).toContain('PHẢI')
  })
})
