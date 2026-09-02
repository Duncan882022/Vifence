import { describe, expect, it } from 'vitest'
import { resolveAppearanceObservationStage } from './patrolAppearanceTier'
import { resolvePatrolEventGps, buildPatrolSubjectGpsLookup } from './patrolBundleGps'

describe('resolveAppearanceObservationStage', () => {
  it('đọc tier_at_observation từ payload', () => {
    expect(resolveAppearanceObservationStage({
      cameraId: 'HC-02',
      zoneId: null,
      startedAt: 1,
      endedAt: 2,
      eventPayload: { tier_at_observation: 'object' },
    })).toBe('object')
    expect(resolveAppearanceObservationStage({
      cameraId: 'HC-02',
      zoneId: null,
      startedAt: 1,
      endedAt: 2,
      eventPayload: { tier_at_observation: 'identity' },
    })).toBe('profile')
  })
})

describe('resolvePatrolEventGps', () => {
  it('ưu tiên GPS từ bundle rồi presences', () => {
    const lookup = buildPatrolSubjectGpsLookup([{
      id: 1,
      subjectId: 'pers-1',
      cameraId: 'HC-02',
      zoneId: null,
      startedAt: 1,
      endedAt: 2,
      gpsLat: 10.1,
      gpsLng: 106.2,
      presenceSeq: 1,
      tier: 'person',
      displayName: 'A',
      sourceCameras: ['HC-02'],
    }])
    expect(resolvePatrolEventGps('pers-1', { lat: 10.5, lng: 106.5 }, lookup)).toEqual({
      lat: 10.5,
      lng: 106.5,
    })
    expect(resolvePatrolEventGps('pers-2', {}, lookup).lat).toBeGreaterThan(0)
  })
})
