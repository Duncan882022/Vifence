import { describe, expect, it } from 'vitest'
import { computePatrolZoneCoverage } from './patrolZoneCoverage'
import { PATROL_SITE_ZONE_ID } from '../data/patrolSiteMap'
import { PATROL_SITE_CENTER } from '../data/patrolSiteMap'

describe('computePatrolZoneCoverage', () => {
  it('zone visited khi có cam gán tĩnh online (chưa GPS)', () => {
    const result = computePatrolZoneCoverage({
      cameraOnlineById: { 'HC-02': true, 'HC-01': false, 'DR-03': false },
    })
    expect(result.totalZones).toBeGreaterThan(0)
    expect(result.visitedByZoneId[PATROL_SITE_ZONE_ID]).toBe(true)
    expect(result.visitedZones).toBe(1)
  })

  it('zone chưa visited khi mọi cam tắt', () => {
    const result = computePatrolZoneCoverage({
      cameraOnlineById: { 'HC-01': false, 'HC-02': false, 'DR-03': false },
    })
    expect(result.visitedZones).toBe(0)
    expect(result.visitedByZoneId[PATROL_SITE_ZONE_ID]).toBe(false)
  })

  it('GPS trong polygon xác nhận tuần tra', () => {
    const [lat, lng] = PATROL_SITE_CENTER
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
            zone_id: PATROL_SITE_ZONE_ID,
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
    expect(result.visitedByZoneId[PATROL_SITE_ZONE_ID]).toBe(true)
  })
})
