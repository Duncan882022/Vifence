import { describe, expect, it } from 'vitest'
import {
  PATROL_HELMET_01_FALLBACK,
  PATROL_HELMET_02_FALLBACK,
} from '../data/patrolSiteMap'
import { haversineM } from './patrolDetectionMapOffset'
import { enforcePatrolHelmetPinSeparation } from './patrolHeatmapGps'

describe('enforcePatrolHelmetPinSeparation', () => {
  it('fallback HC-01 và HC-02 cách nhau đủ xa', () => {
    const dist = haversineM(
      PATROL_HELMET_01_FALLBACK[0],
      PATROL_HELMET_01_FALLBACK[1],
      PATROL_HELMET_02_FALLBACK[0],
      PATROL_HELMET_02_FALLBACK[1],
    )
    expect(dist).toBeGreaterThan(80)
  })

  it('tách HC-02 khi GPS trùng HC-01', () => {
    const base: [number, number] = [20.954617, 106.930071]
    const out = enforcePatrolHelmetPinSeparation({
      'HC-01': base,
      'HC-02': base,
    })
    const dist = haversineM(out['HC-01'][0], out['HC-01'][1], out['HC-02'][0], out['HC-02'][1])
    expect(dist).toBeGreaterThanOrEqual(54)
  })
})
