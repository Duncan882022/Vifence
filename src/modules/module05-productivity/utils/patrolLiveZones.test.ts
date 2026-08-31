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
    expect(zones[0]?.coverage).toBe('VISITED')
    expect(zones[0]?.peopleCurrent).toBe(5)
    expect(zones[0]?.uniquePeople).toBe(7)
  })

  it('visitedByZoneId override — phủ khu theo thiết bị', () => {
    const zones = buildPatrolLiveZonesFromWorkforce(
      EMPTY_WORKFORCE_SNAPSHOT,
      { [PATROL_SITE_ZONE_ID]: true },
    )
    expect(zones[0]?.coverage).toBe('VISITED')
  })

  it('chưa quan sát → NOT_VISITED', () => {
    const zones = buildPatrolLiveZonesFromWorkforce(EMPTY_WORKFORCE_SNAPSHOT)
    expect(zones[0]?.coverage).toBe('NOT_VISITED')
    expect(zones[0]?.peopleCurrent).toBe(0)
  })
})
