import { describe, expect, it } from 'vitest'
import {
  haversineM,
  offsetPatrolDetectionFromHelmet,
  offsetPatrolDetectionBelowHelmet,
  resolvePatrolDetectionMapPosition,
  PATROL_DETECTION_FORWARD_M,
} from './patrolDetectionMapOffset'
import { PATROL_SITE_CENTER } from '../data/patrolSiteMap'

const HELMET: [number, number] = PATROL_SITE_CENTER

describe('patrolDetectionMapOffset', () => {
  it('offset phía trước mũ theo heading 0° (bắc)', () => {
    const [lat, lng] = offsetPatrolDetectionFromHelmet(
      HELMET[0],
      HELMET[1],
      0,
      'pers-1',
      PATROL_DETECTION_FORWARD_M,
    )
    const dist = haversineM(HELMET[0], HELMET[1], lat, lng)
    expect(dist).toBeGreaterThan(2.5)
    expect(dist).toBeLessThan(5)
    expect(lat).toBeGreaterThan(HELMET[0])
  })

  it('offset dưới mũ khi không có heading', () => {
    const [lat] = offsetPatrolDetectionBelowHelmet(
      HELMET[0],
      HELMET[1],
      'obj-1',
    )
    expect(lat).toBeLessThan(HELMET[0])
  })

  it('GPS xa mũ giữ nguyên', () => {
    // Trong polygon công trường, xa mũ > ngưỡng collapse — không offset theo heading.
    const farLat = HELMET[0] - 0.000817
    const farLng = HELMET[1] - 0.002071
    const [lat, lng] = resolvePatrolDetectionMapPosition(
      farLat,
      farLng,
      'pers-2',
      HELMET,
      90,
    )
    expect(lat).toBeCloseTo(farLat, 5)
    expect(lng).toBeCloseTo(farLng, 5)
  })

  it('GPS trùng mũ → offset', () => {
    const [lat, lng] = resolvePatrolDetectionMapPosition(
      HELMET[0],
      HELMET[1],
      'pers-a',
      HELMET,
      180,
    )
    const dist = haversineM(HELMET[0], HELMET[1], lat, lng)
    expect(dist).toBeGreaterThan(2)
  })
})
