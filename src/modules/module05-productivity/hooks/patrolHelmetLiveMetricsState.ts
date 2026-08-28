import {
  getPatrolMobileLiveSnapshot,
  type PatrolMobileLiveSnapshot,
} from '@/services/patrolMobileMetricsBridge'
import type { PatrolHelmetCameraMetricsSlice } from '../services/patrolLiveEvents.service'

export interface PatrolHelmetLiveMetrics {
  backendReachable: boolean
  streamOnline: boolean
  perCamera: PatrolHelmetCameraMetricsSlice[]
}

export const EMPTY_PATROL_HELMET_LIVE_METRICS: PatrolHelmetLiveMetrics = {
  backendReachable: false,
  streamOnline: false,
  perCamera: [],
}

const HC02 = 'HC-02'

/** Gộp snapshot mobile HC-02 vào metrics backend (một nguồn perCamera). */
export function mergeHc02Mobile(
  base: PatrolHelmetLiveMetrics,
  mobile: PatrolMobileLiveSnapshot | null,
): PatrolHelmetLiveMetrics {
  if (!mobile || mobile.cameraId !== HC02) return base
  if (Date.now() - mobile.updatedAt > 45_000) return base

  const perCameraBase = [...base.perCamera]
  const idxBase = perCameraBase.findIndex(c => c.camera_id === HC02)
  const prevSlice = idxBase >= 0 ? perCameraBase[idxBase] : null

  const hc02Slice: PatrolHelmetCameraMetricsSlice = mobile.streamOnline
    ? {
      camera_id: HC02,
      stream_online: true,
      person_count: Math.max(0, mobile.personCount),
      identified_workers: Math.max(mobile.identifiedWorkers, prevSlice?.identified_workers ?? 0),
      person_events_today: prevSlice?.person_events_today ?? 0,
    }
    : {
      camera_id: HC02,
      stream_online: false,
      person_count: 0,
      identified_workers: 0,
      person_events_today: prevSlice?.person_events_today ?? 0,
    }

  if (idxBase >= 0) perCameraBase[idxBase] = { ...perCameraBase[idxBase], ...hc02Slice }
  else perCameraBase.push(hc02Slice)

  const anyOnline = perCameraBase.some(c => Boolean(c.stream_online))

  return {
    backendReachable: base.backendReachable || mobile.streamOnline,
    streamOnline: anyOnline,
    perCamera: perCameraBase,
  }
}

export function hc02MobileSnapshot(): PatrolMobileLiveSnapshot | null {
  return getPatrolMobileLiveSnapshot(HC02)
}
