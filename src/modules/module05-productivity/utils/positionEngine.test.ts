import { beforeEach, describe, expect, it } from 'vitest'
import { PATROL_SITE_CENTER } from '../data/patrolSiteMap'
import { isPointInSiteBoundary } from '../data/patrolSiteGeometry'
import {
  fuseHelmetPose,
  mapRelativeGpsToSite,
  resetHelmetPositionEngine,
} from './positionEngine'

describe('GPS neo tâm CT06 Quảng Yên', () => {
  beforeEach(() => {
    resetHelmetPositionEngine()
  })

  it('lần fix đầu neo tại PATROL_SITE_CENTER', () => {
    const [lat, lng] = mapRelativeGpsToSite('HC-01', 21.0285, 105.8542)
    expect(lat).toBeCloseTo(PATROL_SITE_CENTER[0], 5)
    expect(lng).toBeCloseTo(PATROL_SITE_CENTER[1], 5)
  })

  it('delta GPS di chuyển trong polygon', () => {
    mapRelativeGpsToSite('HC-01', 21.0285, 105.8542)
    const [lat, lng] = mapRelativeGpsToSite('HC-01', 21.02852, 105.85425)
    expect(isPointInSiteBoundary(lat, lng)).toBe(true)
  })

  it('không có GPS → site_anchor tại tâm', () => {
    const pose = fuseHelmetPose({ cameraId: 'HC-01', lat: null, lng: null })
    expect(pose.method).toBe('site_anchor')
    expect(pose.lat).toBeCloseTo(PATROL_SITE_CENTER[0], 5)
    expect(pose.lng).toBeCloseTo(PATROL_SITE_CENTER[1], 5)
  })
})
