import { describe, expect, it } from 'vitest'
import type { TrainingCamera } from '@/modules/module02-training/data/trainingCameras'
import {
  resolvePatrolCameraStreamTelemetry,
  shouldShowPatrolStreamTelemetry,
} from './patrolStreamTelemetry'
import { formatPatrolStreamTelemetryDatetime, formatPatrolTelemetryCoordinate } from './patrolStreamTelemetryFormat'

function cam(partial: Partial<TrainingCamera> & Pick<TrainingCamera, 'id'>): TrainingCamera {
  return {
    name: partial.id,
    location: '',
    zone: '',
    status: 'online',
    streamType: 'bodycam',
    ...partial,
  } as TrainingCamera
}

describe('shouldShowPatrolStreamTelemetry', () => {
  it('ẩn HC-01 — OSD thiết bị', () => {
    expect(shouldShowPatrolStreamTelemetry(cam({ id: 'HC-01', streamType: 'bodycam' }))).toBe(false)
  })

  it('hiện HC-02 bodycam/mobile', () => {
    expect(shouldShowPatrolStreamTelemetry(cam({ id: 'HC-02', streamType: 'bodycam' }))).toBe(true)
    expect(shouldShowPatrolStreamTelemetry(cam({ id: 'HC-02', streamType: 'mobile' }))).toBe(true)
  })

  it('hiện DR-03 flycam', () => {
    expect(shouldShowPatrolStreamTelemetry(cam({ id: 'DR-03', streamType: 'flycam' }))).toBe(true)
  })
})

describe('resolvePatrolCameraStreamTelemetry', () => {
  it('ưu tiên metrics rồi workforce', () => {
    const resolved = resolvePatrolCameraStreamTelemetry('HC-02', {
      metrics: {
        camera_id: 'HC-02',
        stream_online: true,
        person_count: 1,
        identified_workers: 0,
        person_events_today: 0,
        gps_lat: 20.9331,
        gps_lng: 105.7542,
      },
      helmet: {
        type: 'HELMET_STATE',
        helmet_id: 'HC-02',
        timestamp: '',
        lat: 21,
        lon: 106,
        heading: 90,
        zone_id: 'ZONE_SITE',
        online: true,
      },
    })
    expect(resolved.lat).toBe(20.9331)
    expect(resolved.lng).toBe(105.7542)
    expect(resolved.heading).toBe(90)
    expect(resolved.gpsPending).toBe(false)
  })

  it('DR-03 có heading từ workforce', () => {
    const resolved = resolvePatrolCameraStreamTelemetry('DR-03', {
      metrics: {
        camera_id: 'DR-03',
        stream_online: true,
        person_count: 0,
        identified_workers: 0,
        person_events_today: 0,
        gps_lat: 20.93,
        gps_lng: 105.75,
      },
      helmet: {
        type: 'HELMET_STATE',
        helmet_id: 'DR-03',
        timestamp: '',
        lat: 20.93,
        lon: 105.75,
        heading: 270,
        zone_id: 'ZONE_SITE',
        online: true,
      },
    })
    expect(resolved.heading).toBe(270)
  })

  it('chưa GPS → gpsPending', () => {
    const resolved = resolvePatrolCameraStreamTelemetry('HC-02', {
      metrics: {
        camera_id: 'HC-02',
        stream_online: true,
        person_count: 0,
        identified_workers: 0,
        person_events_today: 0,
        gps_lat: null,
        gps_lng: null,
      },
    })
    expect(resolved.gpsPending).toBe(true)
  })
})

describe('formatPatrolStreamTelemetryDatetime', () => {
  it('format DD/MM/YYYY HH:mm:ss giờ VN', () => {
    const text = formatPatrolStreamTelemetryDatetime(new Date('2026-09-01T08:30:45Z'))
    expect(text).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/)
  })
})

describe('formatPatrolTelemetryCoordinate', () => {
  it('format lat/lng 4 chữ số thập phân', () => {
    expect(formatPatrolTelemetryCoordinate(20.9331, 'lat')).toBe('20.9331°N')
    expect(formatPatrolTelemetryCoordinate(105.7542, 'lng')).toBe('105.7542°E')
  })
})
