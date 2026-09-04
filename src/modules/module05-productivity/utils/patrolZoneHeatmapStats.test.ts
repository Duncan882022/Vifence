import { describe, expect, it } from 'vitest'
import {
  buildPatrolHeatmapStatsForZone,
  resolvePatrolPresenceZoneId,
} from './patrolZoneHeatmapStats'
import type { PatrolDayPresence } from '../services/patrolDayEvents.service'
import { PATROL_SITE_ZONE_ID } from '../data/patrolSiteMap'

function presence(partial: Partial<PatrolDayPresence> & Pick<PatrolDayPresence, 'subjectId' | 'tier'>): PatrolDayPresence {
  return {
    id: 1,
    cameraId: 'HC-01',
    sourceCameras: ['HC-01'],
    startedAt: 1,
    endedAt: 2,
    gpsLat: 20.954617,
    gpsLng: 106.930071,
    gpsLatEnd: null,
    gpsLngEnd: null,
    zoneId: partial.zoneId ?? PATROL_SITE_ZONE_ID,
    presenceSeq: partial.presenceSeq ?? 1,
    displayName: '',
    counted: true,
    ...partial,
  }
}

describe('patrolZoneHeatmapStats — single zone', () => {
  it('resolvePatrolPresenceZoneId — mặc định ZONE_1', () => {
    const p = presence({ subjectId: 'a', tier: 'person', zoneId: PATROL_SITE_ZONE_ID })
    expect(resolvePatrolPresenceZoneId(p)).toBe(PATROL_SITE_ZONE_ID)
  })

  it('buildPatrolHeatmapStatsForZone — đếm tier trong zone', () => {
    const presences = [
      presence({ subjectId: 'obj-1', tier: 'object' }),
      presence({ subjectId: 'obj-2', tier: 'object' }),
      presence({ subjectId: 'pers-1', tier: 'person' }),
      presence({ subjectId: 'pers-1', tier: 'person', presenceSeq: 2 }),
      presence({ subjectId: 'iden-1', tier: 'identity' }),
    ]
    expect(buildPatrolHeatmapStatsForZone(presences, PATROL_SITE_ZONE_ID)).toEqual({
      objectCount: 2,
      personCount: 1,
      identityCount: 1,
    })
  })
})
