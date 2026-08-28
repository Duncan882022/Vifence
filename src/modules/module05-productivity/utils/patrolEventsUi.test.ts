import { describe, expect, it } from 'vitest'
import { getPatrolEventLocationLabel } from './patrolEventsUi'

describe('getPatrolEventLocationLabel', () => {
  it('combines zone and camera with dash separator', () => {
    expect(getPatrolEventLocationLabel('Helmet 02', 'Cầu Sông Hốt')).toBe(
      'Cầu Sông Hốt - Helmet 02',
    )
  })

  it('falls back to zone when camera is empty', () => {
    expect(getPatrolEventLocationLabel('', 'Cầu Sông Hốt')).toBe('Cầu Sông Hốt')
  })

  it('falls back to camera when zone is empty', () => {
    expect(getPatrolEventLocationLabel('Helmet 01', '')).toBe('Helmet 01')
  })
})
