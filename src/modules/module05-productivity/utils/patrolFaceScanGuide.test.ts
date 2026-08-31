import { describe, expect, it } from 'vitest'
import {
  faceLooseInFrame,
  faceReadyForSlot,
  guidanceForSlot,
  poseHintMatchesSlot,
} from './patrolFaceScanGuide'
import { FACE_SCAN_POSE_COUNT } from './patrolFaceScanPoses'

describe('patrolFaceScanGuide', () => {
  it('maps head pose to 4 enrollment slots', () => {
    expect(FACE_SCAN_POSE_COUNT).toBe(4)
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
    expect(faceReadyForSlot({
      hasFace: true,
      poseHint: 'down',
      fillScore: 0.5,
      centerX: 0.5,
      centerY: 0.65,
    }, 4)).toBe(true)
  })

  it('loose in-frame accepts front face for slot 1', () => {
    expect(faceLooseInFrame({
      hasFace: true,
      poseHint: 'front',
      fillScore: 0.5,
      centerX: 0.5,
      centerY: 0.5,
    })).toBe(true)
  })

  it('exposes 4 step labels', () => {
    expect(guidanceForSlot(1)).toContain('Bước 1')
    expect(guidanceForSlot(2)).toContain('TRÁI')
    expect(guidanceForSlot(3)).toContain('PHẢI')
    expect(guidanceForSlot(4)).toContain('DƯỚI')
  })
})
