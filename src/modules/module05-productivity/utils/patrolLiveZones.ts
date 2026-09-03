import type { PatrolZone } from '../data/patrolTypes'
import { PATROL_GPS_ZONES, PATROL_SITE_ZONE_SEED } from '../data/patrolSiteMap'
import type { WorkforceSnapshot } from '../types/workforceHeatmap'

/** Zone live trên bản đồ — coverage từ thiết bị tuần tra, không từ observed_count. */
export function buildPatrolLiveZonesFromWorkforce(
  workforce: WorkforceSnapshot,
  visitedByZoneId?: Record<string, boolean>,
): PatrolZone[] {
  const seedById = new Map(PATROL_SITE_ZONE_SEED.map(z => [z.id, z]))

  return PATROL_GPS_ZONES.map(zoneDef => {
    const pop = workforce.zonePopulation[zoneDef.zone_id]
    const observed = pop?.observed_count ?? 0
    const peak = pop?.kpi.peak ?? 0
    const visited = visitedByZoneId?.[zoneDef.zone_id]
      ?? (observed > 0 || peak > 0)
    const seed = seedById.get(zoneDef.zone_id)

    return {
      id: zoneDef.zone_id,
      name: zoneDef.name,
      shortName: zoneDef.shortName,
      coverage: visited ? 'VISITED' : 'NOT_VISITED',
      dwellSeconds: seed?.dwellSeconds ?? 0,
      peopleCurrent: observed,
      vehiclesCurrent: 0,
      uniquePeople: peak,
      uniqueVehicles: 0,
      areaSqm: zoneDef.area_m2,
    }
  })
}
