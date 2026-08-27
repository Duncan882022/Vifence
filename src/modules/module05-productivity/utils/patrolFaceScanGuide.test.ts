import { describe, expect, it } from 'vitest'
import {
  faceReadyForSlot,
  guidanceForSlot,
  poseHintMatchesSlot,
} from './patrolFaceScanGuide'

describe('patrolFaceScanGuide', () => {
  it('maps head pose to enrollment slots (lenient)', () => {
    expect(poseHintMatchesSlot('front', 1)).toBe(true)
    expect(faceReadyForSlot({
      hasFace: true,
      poseHint: 'front',
      fillScore: 0.5,
      centerX: 0.5,
      centerY: 0.5,
    }, 1)).toBe(true)
    expect(faceReadyForSlot({
      hasFace: true,
      poseHint: 'left',
      fillScore: 0.5,
      centerX: 0.38,
      centerY: 0.5,
    }, 2)).toBe(true)
    expect(faceReadyForSlot({
      hasFace: true,
      poseHint: 'right',
      fillScore: 0.5,
      centerX: 0.62,
      centerY: 0.5,
    }, 3)).toBe(true)
  })

  it('exposes simple step labels', () => {
    expect(guidanceForSlot(1)).toContain('Bước 1')
    expect(guidanceForSlot(2)).toContain('TRÁI')
    expect(guidanceForSlot(3)).toContain('PHẢI')
  })
})
