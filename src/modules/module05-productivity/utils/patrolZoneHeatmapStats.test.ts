import { describe, expect, it } from 'vitest'
import {
  buildPatrolHeatmapStatsForZone,
  buildPatrolSiteHeatmapStats,
  resolvePatrolPresenceZoneId,
} from './patrolZoneHeatmapStats'
import type { PatrolDayPresence, PatrolDayStats } from '../services/patrolDayEvents.service'

function presence(partial: Partial<PatrolDayPresence> & Pick<PatrolDayPresence, 'subjectId' | 'tier'>): PatrolDayPresence {
  return {
    id: 1,
    cameraId: 'HC-01',
    zoneId: null,
    startedAt: 0,
    endedAt: 0,
    gpsLat: null,
    gpsLng: null,
    presenceSeq: 1,
    displayName: 'x',
    sourceCameras: ['HC-01'],
    ...partial,
  }
}

describe('patrolZoneHeatmapStats', () => {
  it('site stats đồng bộ dayStats', () => {
    const stats: PatrolDayStats = {
      date: '2026-03-03',
      workersStandard: 0,
      personCount: 12,
      identityCount: 5,
      objectCount: 0,
      promotedObjectCount: 0,
      encountersStandard: 0,
      unassignedObservations: 20,
      sightingsStreamOffline: 0,
      sightingsTotal: 0,
      sightingsUnqualified: 0,
    }
    expect(buildPatrolSiteHeatmapStats(stats)).toEqual({
      objectCount: 20,
      personCount: 12,
      identityCount: 5,
    })
  })

  it('lọc thống kê theo zoneId backend', () => {
    const presences = [
      presence({ subjectId: 'obj-1', tier: 'object', zoneId: 'ZONE_SITE' }),
      presence({ subjectId: 'obj-2', tier: 'object', zoneId: 'ZONE_SITE' }),
      presence({ subjectId: 'pers-1', tier: 'person', zoneId: 'ZONE_SITE' }),
      presence({ subjectId: 'pers-1', tier: 'person', zoneId: 'ZONE_SITE', presenceSeq: 2 }),
      presence({ subjectId: 'iden-1', tier: 'identity', zoneId: 'ZONE_SITE' }),
    ]
    expect(buildPatrolHeatmapStatsForZone(presences, 'ZONE_SITE')).toEqual({
      objectCount: 2,
      personCount: 1,
      identityCount: 1,
    })
  })

  it('resolve zone từ zoneId', () => {
    const p = presence({ subjectId: 'a', tier: 'person', zoneId: 'ZONE_SITE' })
    expect(resolvePatrolPresenceZoneId(p)).toBe('ZONE_SITE')
  })
})
