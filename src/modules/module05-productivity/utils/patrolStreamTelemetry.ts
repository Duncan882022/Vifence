import type { TrainingCamera } from '@/modules/module02-training/data/trainingCameras'
import type { PatrolHelmetCameraMetricsSlice } from '../services/patrolLiveEvents.service'
import type { HelmetState } from '../types/workforceHeatmap'
import type { PatrolHelmetGpsSnapshot } from '@/services/patrolHelmetGpsBridge'

export interface PatrolStreamTelemetryResolved {
  lat: number | null
  lng: number | null
  heading: number | null
  gpsPending: boolean
}

/** HC-01 có OSD thiết bị — CMS không vẽ thêm. HC-02 / DR-* cần overlay. */
export function shouldShowPatrolStreamTelemetry(cam: TrainingCamera): boolean {
  if (cam.id === 'HC-01' && cam.streamType === 'bodycam') return false
  if (cam.id.startsWith('HC-') && cam.id !== 'HC-01') {
    return cam.streamType === 'bodycam' || cam.streamType === 'mobile'
  }
  if (cam.id.startsWith('DR-') && cam.streamType === 'flycam') return true
  return false
}

function readCoord(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return value
}

export function resolvePatrolCameraStreamTelemetry(
  _cameraId: string,
  sources: {
    metrics?: PatrolHelmetCameraMetricsSlice | null
    helmet?: HelmetState | null
    bridge?: PatrolHelmetGpsSnapshot | null
  },
): PatrolStreamTelemetryResolved {
  const metrics = sources.metrics
  const helmet = sources.helmet
  const bridge = sources.bridge

  let lat = readCoord(metrics?.gps_lat)
  let lng = readCoord(metrics?.gps_lng)
  let heading = readCoord(helmet?.heading)

  if (lat == null) lat = readCoord(helmet?.lat)
  if (lng == null) lng = readCoord(helmet?.lon)

  if (lat == null && bridge && !bridge.isDefault) lat = readCoord(bridge.lat)
  if (lng == null && bridge && !bridge.isDefault) lng = readCoord(bridge.lng)

  const gpsPending = lat == null || lng == null
  return { lat, lng, heading, gpsPending }
}
