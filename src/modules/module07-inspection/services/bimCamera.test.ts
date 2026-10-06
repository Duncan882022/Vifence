import { describe, expect, it } from 'vitest'
import { fitDistance } from './bimCamera'

describe('fitDistance', () => {
  it('backs the camera farther on a tall portrait frame than on landscape', () => {
    const radius = 16
    const portrait = fitDistance(radius, 42, 390 / 844)
    const landscape = fitDistance(radius, 42, 844 / 390)
    expect(portrait).toBeGreaterThan(landscape * 1.6)
  })

  it('never collapses to a distance smaller than the radius', () => {
    expect(fitDistance(10, 42, 1)).toBeGreaterThan(10)
  })
})
