import { describe, expect, it } from 'vitest'
import {
  PATROL_SITE_BOUNDARY_RING,
  isPointInSiteBoundary,
} from '../data/patrolSiteGeometry'
import { PATROL_GPS_ZONES, PATROL_SITE_CENTER } from '../data/patrolSiteMap'

describe('patrolSiteGeometry capsule', () => {
  it('boundary là capsule — nhiều đỉnh + 2 đầu tròn', () => {
    expect(PATROL_SITE_BOUNDARY_RING.length).toBeGreaterThan(40)
  })

  it('ghim Bùi Xá nằm trong viền đỏ', () => {
    const [lat, lng] = PATROL_SITE_CENTER
    expect(isPointInSiteBoundary(lat, lng)).toBe(true)
  })

  it('7 khu bằng nhau', () => {
    expect(PATROL_GPS_ZONES).toHaveLength(7)
    const areas = PATROL_GPS_ZONES.map(z => z.area_m2)
    expect(new Set(areas).size).toBe(1)
  })
})
