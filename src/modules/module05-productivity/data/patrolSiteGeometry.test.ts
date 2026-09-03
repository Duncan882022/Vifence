import { describe, expect, it } from 'vitest'
import {
  PATROL_SITE_BOUNDARY_RING,
  PATROL_SURVEY_PIN,
  isPointInSiteBoundary,
} from '../data/patrolSiteGeometry'
import {
  PATROL_GPS_ZONES,
  PATROL_HELMET_01_FALLBACK,
  PATROL_HELMET_02_FALLBACK,
  PATROL_HELMET_ZONE_ASSIGNMENTS,
  PATROL_MAP_ACTIVE_DRONE_PINS,
  PATROL_MAP_ACTIVE_HELMET_PINS,
  PATROL_SITE_CENTER,
  PATROL_ZONE_DIVIDER_LINES,
  buildPatrolZoneDividerLines,
} from '../data/patrolSiteMap'

describe('patrolSiteGeometry capsule', () => {
  it('boundary là capsule — nhiều đỉnh + 2 đầu tròn', () => {
    expect(PATROL_SITE_BOUNDARY_RING.length).toBeGreaterThan(40)
  })

  it('ghim khảo sát nằm trong viền dự án và ZONE_3', () => {
    const [lat, lng] = PATROL_SURVEY_PIN
    expect(isPointInSiteBoundary(lat, lng)).toBe(true)
    expect(PATROL_SITE_CENTER).toEqual(PATROL_SURVEY_PIN)
    const zone3 = PATROL_GPS_ZONES.find(z => z.zone_id === 'ZONE_3')!
    const poly = zone3.polygon
    let inside = false
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [yi, xi] = poly[i]
      const [yj, xj] = poly[j]
      if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
        inside = !inside
      }
    }
    expect(inside).toBe(true)
  })

  it('6 đường nét đứt chia 7 khu', () => {
    expect(PATROL_ZONE_DIVIDER_LINES).toHaveLength(6)
    expect(buildPatrolZoneDividerLines()[0]?.length).toBeGreaterThan(1)
  })

  it('7 khu bằng nhau', () => {
    expect(PATROL_GPS_ZONES).toHaveLength(7)
  })

  it('pin thiết bị — HC-01 z1, HC-02 z2, DR-03 z3', () => {
    expect(PATROL_HELMET_ZONE_ASSIGNMENTS.find(a => a.helmetId === 'HC-01')?.zoneId).toBe('ZONE_1')
    expect(PATROL_HELMET_ZONE_ASSIGNMENTS.find(a => a.helmetId === 'HC-02')?.zoneId).toBe('ZONE_2')
    expect(PATROL_MAP_ACTIVE_HELMET_PINS.find(p => p.id === 'HC-01')?.zoneId).toBe('ZONE_1')
    expect(PATROL_MAP_ACTIVE_HELMET_PINS.find(p => p.id === 'HC-02')?.zoneId).toBe('ZONE_2')
    expect(PATROL_MAP_ACTIVE_DRONE_PINS[0]?.zoneId).toBe('ZONE_3')
    expect(PATROL_MAP_ACTIVE_DRONE_PINS[0]?.position).toEqual(PATROL_SURVEY_PIN)
    expect(PATROL_HELMET_01_FALLBACK).toEqual(PATROL_GPS_ZONES[0]?.center)
    expect(PATROL_HELMET_02_FALLBACK).toEqual(PATROL_GPS_ZONES[1]?.center)
  })
})
