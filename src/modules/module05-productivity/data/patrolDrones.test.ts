import { describe, expect, it } from 'vitest'
import { getCameraAiConfigSections } from '@/modules/module02-training/data/cameraAiModelTokens'
import { isPatrolDroneRoiMandatory, PATROL_DRONE_AERIAL_ACTIVE_HEX, patrolDroneMapAccent } from './patrolDrones'

describe('patrolDrones', () => {
  it('DR-03 bắt buộc ROI trên tile', () => {
    expect(isPatrolDroneRoiMandatory('DR-03')).toBe(true)
    expect(isPatrolDroneRoiMandatory('HC-01')).toBe(false)
  })

  it('tầm cao active — accent sky', () => {
    expect(patrolDroneMapAccent('DR-03', true, 'aerial', '#ef4444')).toBe(PATROL_DRONE_AERIAL_ACTIVE_HEX)
    expect(patrolDroneMapAccent('DR-03', false, 'aerial', '#ef4444')).toBe('#ef4444')
    expect(patrolDroneMapAccent('HC-01', true, 'aerial', '#22c55e')).toBe('#22c55e')
  })
})

describe('getCameraAiConfigSections DR-03', () => {
  it('có section tuần tra flycam thay vì demo client', () => {
    const sections = getCameraAiConfigSections('DR-03')
    expect(sections).toHaveLength(1)
    expect(sections[0]?.title).toBe('Tuần tra flycam')
    expect(sections[0]?.modelIds).toEqual(['patrol_person'])
  })
})
