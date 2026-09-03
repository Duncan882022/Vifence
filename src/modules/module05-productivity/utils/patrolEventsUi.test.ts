import { describe, expect, it } from 'vitest'
import {
  buildPatrolSubjectCameraLookup,
  getPatrolEventLocationLabel,
  resolvePatrolSubjectCameraRef,
} from './patrolEventsUi'
import type { PatrolDayPresence } from '../services/patrolDayEvents.service'

import { PATROL_SITE_NAME } from '../data/patrolSiteMap'

describe('getPatrolEventLocationLabel', () => {
  it('combines zone and camera with dash separator', () => {
    expect(getPatrolEventLocationLabel('Helmet 02', PATROL_SITE_NAME)).toBe(
      `${PATROL_SITE_NAME} - Helmet 02`,
    )
  })

  it('falls back to zone when camera is empty', () => {
    expect(getPatrolEventLocationLabel('', PATROL_SITE_NAME)).toBe(PATROL_SITE_NAME)
  })

  it('defaults zone to site name when zone is empty', () => {
    expect(getPatrolEventLocationLabel('Helmet 01', '')).toBe(`${PATROL_SITE_NAME} - Helmet 01`)
  })

  it('resolves camera name from cameraId when cameraName is empty', () => {
    expect(getPatrolEventLocationLabel('', PATROL_SITE_NAME, 'HC-01')).toBe(
      `${PATROL_SITE_NAME} - Helmet 01`,
    )
    expect(getPatrolEventLocationLabel('', PATROL_SITE_NAME, 'DR-03')).toBe(
      `${PATROL_SITE_NAME} - Drone 03`,
    )
  })
})

describe('buildPatrolSubjectCameraLookup', () => {
  const presences: PatrolDayPresence[] = [
    {
      id: 1,
      subjectId: 'pers-abc',
      cameraId: 'HC-01',
      zoneId: 'ZONE_SITE',
      startedAt: 100,
      endedAt: 200,
      gpsLat: null,
      gpsLng: null,
      presenceSeq: 1,
      tier: 'person',
      displayName: 'pers-abc',
      sourceCameras: ['HC-01'],
    },
    {
      id: 2,
      subjectId: 'pers-abc',
      cameraId: 'HC-02',
      zoneId: 'ZONE_SITE',
      startedAt: 300,
      endedAt: 400,
      gpsLat: null,
      gpsLng: null,
      presenceSeq: 2,
      tier: 'person',
      displayName: 'pers-abc',
      sourceCameras: ['HC-02'],
    },
  ]

  it('keeps the latest presence camera per subject', () => {
    const lookup = buildPatrolSubjectCameraLookup(presences)
    const ref = resolvePatrolSubjectCameraRef(lookup, 'pers-abc')
    expect(ref.cameraId).toBe('HC-02')
    expect(ref.cameraName).toBe('Helmet 02')
    expect(getPatrolEventLocationLabel(ref.cameraName, ref.zoneName)).toBe(
      `${PATROL_SITE_NAME} - Helmet 02`,
    )
  })
})
