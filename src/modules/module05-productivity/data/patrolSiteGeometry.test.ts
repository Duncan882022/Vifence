import { describe, expect, it } from 'vitest'
import {
  PATROL_SITE_BOUNDARY_RING,
  PATROL_SURVEY_PIN,
  PATROL_ZONE_1_QUAD,
  PATROL_ZONE_2_QUAD,
  PATROL_ZONE_K1_SOUTH_EAST,
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
  PATROL_SITE_ZONE_2_ID,
  PATROL_SITE_ZONE_ID,
  PATROL_SITE_NAME,
  PATROL_ZONE_DIVIDER_LINES,
  buildPatrolZoneDividerLines,
  resolvePatrolHeatmapZoneTitle,
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

describe('patrolSiteGeometry — hai khu Cầu Sông Hốt', () => {
  it('hai quad sát nhau — cạnh chia K1[1→2] = K2[0→3]', () => {
    expect(PATROL_ZONE_1_QUAD).toHaveLength(4)
    expect(PATROL_ZONE_2_QUAD).toHaveLength(4)
    expect(PATROL_ZONE_1_QUAD[1]).toEqual(PATROL_ZONE_2_QUAD[0])
    expect(PATROL_ZONE_1_QUAD[2]).toEqual(PATROL_ZONE_2_QUAD[3])
    expect(PATROL_ZONE_1_QUAD[2]).toEqual(PATROL_ZONE_K1_SOUTH_EAST)
  })

  it('boundary ring 6 đỉnh — không khuyết giữa hai khu', () => {
    expect(PATROL_SITE_BOUNDARY_RING).toHaveLength(6)
    expect(PATROL_SITE_BOUNDARY_RING[0]).toEqual(PATROL_ZONE_1_QUAD[0])
    expect(PATROL_SITE_BOUNDARY_RING[1]).toEqual(PATROL_ZONE_1_QUAD[1])
    expect(PATROL_SITE_BOUNDARY_RING[4]).toEqual(PATROL_ZONE_K1_SOUTH_EAST)
  })

  it('centroid nằm trong một trong hai khu', () => {
    const [lat, lng] = PATROL_SURVEY_PIN
    expect(isPointInSiteBoundary(lat, lng)).toBe(true)
    expect(PATROL_SITE_CENTER).toEqual(PATROL_SURVEY_PIN)
  })

  it('patrolSitePoint nội suy trong từng khu', () => {
    const k1 = patrolSitePoint(0.25, 0.5)
    const k2 = patrolSitePoint(0.75, 0.5)
    expect(isPointInPolygon(k1[0], k1[1], PATROL_ZONE_1_QUAD)).toBe(true)
    expect(isPointInPolygon(k2[0], k2[1], PATROL_ZONE_2_QUAD)).toBe(true)
  })

  it('hai zone GPS — đỏ KV1, xanh KV2', () => {
    expect(PATROL_GPS_ZONES).toHaveLength(2)
    expect(PATROL_GPS_ZONES[0]?.zone_id).toBe(PATROL_SITE_ZONE_ID)
    expect(PATROL_GPS_ZONES[0]?.polygon).toEqual(PATROL_ZONE_1_QUAD)
    expect(PATROL_GPS_ZONES[0]?.borderColor).toBe('#ef4444')
    expect(PATROL_GPS_ZONES[1]?.zone_id).toBe(PATROL_SITE_ZONE_2_ID)
    expect(PATROL_GPS_ZONES[1]?.polygon).toEqual(PATROL_ZONE_2_QUAD)
    expect(PATROL_GPS_ZONES[1]?.borderColor).toBe('#22c55e')
  })

  it('không còn nét đứt chia khu', () => {
    expect(PATROL_ZONE_DIVIDER_LINES).toHaveLength(0)
    expect(buildPatrolZoneDividerLines()).toHaveLength(0)
  })

  it('resolvePatrolHeatmapZoneTitle — click khu trên heatmap', () => {
    expect(resolvePatrolHeatmapZoneTitle(null)).toBe(PATROL_SITE_NAME)
    expect(resolvePatrolHeatmapZoneTitle(PATROL_SITE_ZONE_ID)).toBe('Khu 1')
    expect(resolvePatrolHeatmapZoneTitle(PATROL_SITE_ZONE_2_ID)).toBe('Khu 2')
  })

  it('pin thiết bị — HC-01/KV1, HC-02/DR-03/KV2', () => {
    expect(PATROL_HELMET_ZONE_ASSIGNMENTS.find(a => a.helmetId === 'HC-01')?.zoneId).toBe('ZONE_1')
    expect(PATROL_HELMET_ZONE_ASSIGNMENTS.find(a => a.helmetId === 'HC-02')?.zoneId).toBe('ZONE_2')
    expect(PATROL_MAP_ACTIVE_HELMET_PINS.find(p => p.id === 'HC-01')?.zoneId).toBe('ZONE_1')
    expect(PATROL_MAP_ACTIVE_HELMET_PINS.find(p => p.id === 'HC-02')?.zoneId).toBe('ZONE_2')
    expect(PATROL_MAP_ACTIVE_DRONE_PINS[0]?.zoneId).toBe('ZONE_2')
    for (const pin of [...PATROL_MAP_ACTIVE_HELMET_PINS, ...PATROL_MAP_ACTIVE_DRONE_PINS]) {
      expect(isPointInSiteBoundary(pin.position[0], pin.position[1])).toBe(true)
    }
    expect(isPointInSiteBoundary(PATROL_HELMET_01_FALLBACK[0], PATROL_HELMET_01_FALLBACK[1])).toBe(true)
    expect(isPointInSiteBoundary(PATROL_HELMET_02_FALLBACK[0], PATROL_HELMET_02_FALLBACK[1])).toBe(true)
  })
})
