import { describe, expect, it } from 'vitest'
import {
  PATROL_SITE_AREA_M2,
  PATROL_SITE_BOUNDARY_RING,
  PATROL_SITE_CENTER,
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
  PATROL_SITE_NAME,
  PATROL_SITE_ZONE_ID,
  PATROL_ZONE_DIVIDER_LINES,
  buildPatrolZoneDividerLines,
} from '../data/patrolSiteMap'
import { haversineM } from '../utils/patrolDetectionMapOffset'

describe('patrolSiteGeometry — Cầu Sông Hốt single zone', () => {
  it('viền heatmap = 4 điểm GPS khảo sát', () => {
    expect(PATROL_SITE_BOUNDARY_RING).toEqual([
      [20.955148, 106.924572],
      [20.957172, 106.934593],
      [20.953906, 106.93528],
      [20.952243, 106.925838],
    ])
  })

  it('tâm site nằm trong polygon', () => {
    const [lat, lng] = PATROL_SITE_CENTER
    expect(isPointInSiteBoundary(lat, lng)).toBe(true)
    expect(PATROL_SURVEY_PIN).toEqual(PATROL_SITE_CENTER)
  })

  it('một zone duy nhất — không chia khu', () => {
    expect(PATROL_GPS_ZONES).toHaveLength(1)
    expect(PATROL_GPS_ZONES[0]?.zone_id).toBe(PATROL_SITE_ZONE_ID)
    expect(PATROL_GPS_ZONES[0]?.name).toBe(PATROL_SITE_NAME)
    expect(PATROL_ZONE_DIVIDER_LINES).toHaveLength(0)
    expect(buildPatrolZoneDividerLines()).toHaveLength(0)
  })

  it('polygon zone trùng viền site', () => {
    const zone = PATROL_GPS_ZONES[0]!
    expect(zone.polygon).toHaveLength(4)
    expect(isPointInSiteBoundary(zone.center[0], zone.center[1])).toBe(true)
    expect(PATROL_SITE_AREA_M2).toBeGreaterThan(100_000)
  })

  it('patrolSitePoint nội suy trong quad', () => {
    const center = patrolSitePoint(0.5, 0.5)
    expect(isPointInSiteBoundary(center[0], center[1])).toBe(true)
  })

  it('pin thiết bị — tất cả thuộc ZONE_SITE', () => {
    expect(PATROL_HELMET_ZONE_ASSIGNMENTS.every(a => a.zoneId === PATROL_SITE_ZONE_ID)).toBe(true)
    expect(PATROL_MAP_ACTIVE_HELMET_PINS.every(p => p.zoneId === PATROL_SITE_ZONE_ID)).toBe(true)
    expect(PATROL_MAP_ACTIVE_DRONE_PINS[0]?.zoneId).toBe(PATROL_SITE_ZONE_ID)
    expect(PATROL_MAP_ACTIVE_DRONE_PINS[0]?.position).toEqual(PATROL_SURVEY_PIN)
  })

  it('fallback HC-01 và HC-02 cách nhau đủ xa', () => {
    const dist = haversineM(
      PATROL_HELMET_01_FALLBACK[0],
      PATROL_HELMET_01_FALLBACK[1],
      PATROL_HELMET_02_FALLBACK[0],
      PATROL_HELMET_02_FALLBACK[1],
    )
    expect(dist).toBeGreaterThan(80)
  })
})
