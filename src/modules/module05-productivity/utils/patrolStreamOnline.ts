import type { PatrolHelmetCameraMetricsSlice } from '../services/patrolLiveEvents.service'

export interface PatrolStreamOnlineOptions {
  /** Tile đang có hình — ưu tiên hơn backend báo offline. */
  framesLiveById?: ReadonlyMap<string, boolean>
}

export interface PatrolCameraOnlineState {
  online: boolean
  framesLive: boolean
  streamOfflineConfirmed: boolean
}

/**
 * Nguồn sự thật online/offline stream tuần tra (tile + heatmap).
 * HC-02 mobile đã merge vào `perCamera` qua usePatrolHelmetLiveMetrics.
 */
export function resolvePatrolCameraOnlineState(
  cameraId: string,
  perCamera: PatrolHelmetCameraMetricsSlice[],
  opts: PatrolStreamOnlineOptions = {},
): PatrolCameraOnlineState {
  let reported: boolean | undefined
  for (const row of perCamera) {
    if (row.camera_id === cameraId) {
      reported = Boolean(row.stream_online)
      break
    }
  }

  const framesLive = opts.framesLiveById?.get(cameraId) ?? false
  const online = framesLive || (reported ?? false)

  return {
    online,
    framesLive,
    streamOfflineConfirmed: reported === false && !framesLive,
  }
}

export function buildPatrolHelmetOnlineById(
  cameraIds: readonly string[],
  perCamera: PatrolHelmetCameraMetricsSlice[],
  opts: PatrolStreamOnlineOptions = {},
): Record<string, boolean> {
  const map: Record<string, boolean> = {}
  for (const id of cameraIds) {
    map[id] = resolvePatrolCameraOnlineState(id, perCamera, opts).online
  }
  return map
}
