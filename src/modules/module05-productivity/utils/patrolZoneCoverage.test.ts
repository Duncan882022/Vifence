import { describe, expect, it } from 'vitest'
import { computePatrolZoneCoverage } from './patrolZoneCoverage'
import { PATROL_GPS_ZONES, PATROL_SITE_ZONE_ID } from '../data/patrolSiteMap'

describe('computePatrolZoneCoverage', () => {
  it('zone visited khi có cam online trong ZONE_1', () => {
    const result = computePatrolZoneCoverage({
      cameraOnlineById: { 'HC-02': false, 'HC-01': true, 'DR-03': false },
    })
    expect(result.totalZones).toBe(2)
    expect(result.visitedByZoneId[PATROL_SITE_ZONE_ID]).toBe(true)
    expect(result.visitedByZoneId['ZONE_2']).toBe(false)
    expect(result.visitedZones).toBe(1)
  })

  it('zone chưa visited khi mọi cam tắt', () => {
    const result = computePatrolZoneCoverage({
      cameraOnlineById: { 'HC-01': false, 'HC-02': false, 'DR-03': false },
    })
    expect(result.visitedZones).toBe(0)
    expect(result.visitedByZoneId[PATROL_SITE_ZONE_ID]).toBe(false)
    expect(result.visitedByZoneId['ZONE_2']).toBe(false)
  })

  it('GPS trong polygon xác nhận tuần tra', () => {
    const zone = PATROL_GPS_ZONES.find(z => z.zone_id === 'ZONE_2')!
    const [lat, lng] = zone.center
    const result = computePatrolZoneCoverage({
      cameraOnlineById: { 'DR-03': true },
      workforce: {
        helmets: {
          'DR-03': {
            type: 'HELMET_STATE',
            helmet_id: 'DR-03',
            timestamp: '',
            lat,
            lon: lng,
            heading: 0,
            pitch: 0,
            roll: 0,
            zone_id: 'ZONE_2',
            online: true,
            position_method: 'raw',
          },
        },
        objects: {},
        zonePopulation: {},
        heatPoints: [],
        events: [],
        server_time: '',
      },
    })
    expect(result.visitedByZoneId['ZONE_2']).toBe(true)
  })
})
