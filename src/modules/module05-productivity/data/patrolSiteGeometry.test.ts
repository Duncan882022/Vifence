import { describe, expect, it } from 'vitest'
import {
  PATROL_SITE_BOUNDARY_RING,
  PATROL_SITE_QUAD,
  PATROL_SURVEY_PIN,
  isPointInSiteBoundary,
  patrolSitePoint,
} from '../data/patrolSiteGeometry'
import {
  PATROL_GPS_ZONES,
  PATROL_HELMET_01_FALLBACK,
  PATROL_HELMET_02_FALLBACK,
  PATROL_HELMET_ZONE_ASSIGNMENTS,
  PATROL_MAP_ACTIVE_DRONE_PINS,
  PATROL_MAP_ACTIVE_HELMET_PINS,
  PATROL_SITE_CENTER,
  PATROL_SITE_ZONE_ID,
  PATROL_ZONE_DIVIDER_LINES,
  buildPatrolZoneDividerLines,
} from '../data/patrolSiteMap'

function isPointInPolygon(lat: number, lng: number, polygon: [number, number][]): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i]
    const [yj, xj] = polygon[j]
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

describe('patrolSiteGeometry — quad Cầu Sông Hốt', () => {
  it('boundary ring = 4 đỉnh khảo sát', () => {
    expect(PATROL_SITE_BOUNDARY_RING).toEqual(PATROL_SITE_QUAD)
    expect(PATROL_SITE_BOUNDARY_RING).toHaveLength(4)
  })

  it('centroid nằm trong polygon', () => {
    const [lat, lng] = PATROL_SURVEY_PIN
    expect(isPointInSiteBoundary(lat, lng)).toBe(true)
    expect(PATROL_SITE_CENTER).toEqual(PATROL_SURVEY_PIN)
  })

  it('patrolSitePoint nội suy trong quad', () => {
    const center = patrolSitePoint(0.5, 0.5)
    expect(isPointInPolygon(center[0], center[1], PATROL_SITE_QUAD)).toBe(true)
  })

  it('một zone duy nhất trùng viền đỏ', () => {
    expect(PATROL_GPS_ZONES).toHaveLength(1)
    expect(PATROL_GPS_ZONES[0]?.zone_id).toBe(PATROL_SITE_ZONE_ID)
    expect(PATROL_GPS_ZONES[0]?.name).toBe('Cầu Sông Hốt')
    expect(PATROL_GPS_ZONES[0]?.polygon).toEqual(PATROL_SITE_QUAD)
  })

  it('không còn nét đứt chia khu', () => {
    expect(PATROL_ZONE_DIVIDER_LINES).toHaveLength(0)
    expect(buildPatrolZoneDividerLines()).toHaveLength(0)
  })

  it('pin thiết bị — mọi mũ/drone thuộc ZONE_1', () => {
    expect(PATROL_HELMET_ZONE_ASSIGNMENTS.every(a => a.zoneId === 'ZONE_1')).toBe(true)
    expect(PATROL_MAP_ACTIVE_HELMET_PINS.every(p => p.zoneId === 'ZONE_1')).toBe(true)
    expect(PATROL_MAP_ACTIVE_DRONE_PINS[0]?.zoneId).toBe('ZONE_1')
    for (const pin of [...PATROL_MAP_ACTIVE_HELMET_PINS, ...PATROL_MAP_ACTIVE_DRONE_PINS]) {
      expect(isPointInSiteBoundary(pin.position[0], pin.position[1])).toBe(true)
    }
    expect(isPointInSiteBoundary(PATROL_HELMET_01_FALLBACK[0], PATROL_HELMET_01_FALLBACK[1])).toBe(true)
    expect(isPointInSiteBoundary(PATROL_HELMET_02_FALLBACK[0], PATROL_HELMET_02_FALLBACK[1])).toBe(true)
  })
})
