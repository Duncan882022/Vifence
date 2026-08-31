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
    expect(poseHintMatchesSlot('left', 2)).toBe(true)
    expect(poseHintMatchesSlot('right', 3)).toBe(true)
    expect(poseHintMatchesSlot('down', 4)).toBe(true)
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
      centerX: 0.34,
      centerY: 0.5,
    }, 2)).toBe(true)
    expect(faceReadyForSlot({
      hasFace: true,
      poseHint: 'right',
      fillScore: 0.5,
      centerX: 0.66,
      centerY: 0.5,
    }, 3)).toBe(true)
    expect(faceReadyForSlot({
      hasFace: true,
      poseHint: 'down',
      fillScore: 0.5,
      centerX: 0.5,
      centerY: 0.62,
    }, 4)).toBe(true)
  })

  it('rejects wrong pose for slot', () => {
    expect(faceReadyForSlot({
      hasFace: true,
      poseHint: 'left',
      fillScore: 0.5,
      centerX: 0.34,
      centerY: 0.5,
    }, 1)).toBe(false)
    expect(faceReadyForSlot({
      hasFace: true,
      poseHint: 'front',
      fillScore: 0.5,
      centerX: 0.5,
      centerY: 0.5,
    }, 2)).toBe(false)
  })

  it('loose in-frame accepts centered face', () => {
    expect(faceLooseInFrame({
      hasFace: true,
      poseHint: 'front',
      fillScore: 0.5,
      centerX: 0.5,
      centerY: 0.5,
    })).toBe(true)
  })

  it('exposes 4 gallery step labels', () => {
    expect(guidanceForSlot(1)).toContain('Nhìn thẳng')
    expect(guidanceForSlot(2)).toContain('trái')
    expect(guidanceForSlot(3)).toContain('phải')
    expect(guidanceForSlot(4)).toContain('Cúi')
  })
})
