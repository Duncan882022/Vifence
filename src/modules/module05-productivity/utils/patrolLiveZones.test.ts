import { describe, expect, it } from 'vitest'
import { PATROL_SITE_ZONE_ID } from '../data/patrolSiteMap'
import { EMPTY_WORKFORCE_SNAPSHOT } from '../types/workforceHeatmap'
import { buildPatrolLiveZonesFromWorkforce } from './patrolLiveZones'

describe('buildPatrolLiveZonesFromWorkforce', () => {
  it('zone có quan sát → VISITED + peopleCurrent', () => {
    const zones = buildPatrolLiveZonesFromWorkforce({
      ...EMPTY_WORKFORCE_SNAPSHOT,
      zonePopulation: {
        [PATROL_SITE_ZONE_ID]: {
          zone_id: PATROL_SITE_ZONE_ID,
          timestamp: new Date().toISOString(),
          observed_count: 5,
          observability: 0.8,
          observability_band: 'MEDIUM',
          breakdown: {
            full_body_count: 3,
            upper_body_count: 2,
            verified_identities: 1,
            unknown_objects: 0,
          },
          helmet_references: ['HC-01'],
          kpi: { current: 5, average: 4, peak: 7 },
        },
      },
    })
    const siteZone = zones.find(z => z.id === PATROL_SITE_ZONE_ID)
    expect(siteZone?.coverage).toBe('VISITED')
    expect(siteZone?.peopleCurrent).toBe(5)
    expect(siteZone?.uniquePeople).toBe(7)
    expect(zones.length).toBe(2)
  })

  it('visitedByZoneId override — phủ khu theo thiết bị', () => {
    const zones = buildPatrolLiveZonesFromWorkforce(
      EMPTY_WORKFORCE_SNAPSHOT,
      { ZONE_1: true, ZONE_2: false },
    )
    const zone1 = zones.find(z => z.id === 'ZONE_1')
    const zone2 = zones.find(z => z.id === 'ZONE_2')
    expect(zone1?.coverage).toBe('VISITED')
    expect(zone2?.coverage).toBe('NOT_VISITED')
  })

  it('chưa quan sát → NOT_VISITED', () => {
    const zones = buildPatrolLiveZonesFromWorkforce(EMPTY_WORKFORCE_SNAPSHOT)
    expect(zones.every(z => z.coverage === 'NOT_VISITED')).toBe(true)
    expect(zones.every(z => z.peopleCurrent === 0)).toBe(true)
    expect(zones.length).toBe(2)
  })
})
