import { describe, expect, it } from 'vitest'
import { getCameraAiConfigSections } from '@/modules/module02-training/data/cameraAiModelTokens'
import { isPatrolDroneRoiMandatory } from './patrolDrones'

describe('patrolDrones', () => {
  it('DR-03 bắt buộc ROI trên tile', () => {
    expect(isPatrolDroneRoiMandatory('DR-03')).toBe(true)
    expect(isPatrolDroneRoiMandatory('HC-01')).toBe(false)
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
