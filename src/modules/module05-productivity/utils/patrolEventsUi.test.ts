import { describe, expect, it } from 'vitest'
import {
  buildPatrolSubjectCameraLookup,
  getPatrolEventLocationLabel,
  resolvePatrolSubjectCameraRef,
} from './patrolEventsUi'
import type { PatrolDayPresence } from '../services/patrolDayEvents.service'

describe('getPatrolEventLocationLabel', () => {
  it('combines camera and zone with dash separator', () => {
    expect(getPatrolEventLocationLabel('Helmet 02', 'Cầu Sông Hốt')).toBe(
      'Helmet 02 - Cầu Sông Hốt',
    )
  })

  it('falls back to zone when camera is empty', () => {
    expect(getPatrolEventLocationLabel('', 'Cầu Sông Hốt')).toBe('Cầu Sông Hốt')
  })

  it('defaults zone to site name when zone is empty', () => {
    expect(getPatrolEventLocationLabel('Helmet 01', '')).toBe('Helmet 01 - Cầu Sông Hốt')
  })

  it('resolves camera name from cameraId when cameraName is empty', () => {
    expect(getPatrolEventLocationLabel('', 'Cầu Sông Hốt', 'HC-01')).toBe(
      'Helmet 01 - Cầu Sông Hốt',
    )
    expect(getPatrolEventLocationLabel('', 'Cầu Sông Hốt', 'DR-03')).toBe(
      'Drone 03 - Cầu Sông Hốt',
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
      'Helmet 02 - Cầu Sông Hốt',
    )
  })
})
