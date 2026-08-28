import type { PatrolHelmetCameraMetricsSlice } from '../services/patrolLiveEvents.service'

export interface PatrolStreamOnlineOptions {
  /** HC-02 phát từ tab mobile cùng trình duyệt. */
  hc02MobileOnline?: boolean
  /** Tile đang có hình — ưu tiên hơn backend báo offline. */
  framesLiveById?: ReadonlyMap<string, boolean>
}

export interface PatrolCameraOnlineState {
  online: boolean
  framesLive: boolean
  streamOfflineConfirmed: boolean
}

/**
 * Nguồn sự thật duy nhất cho online/offline stream tuần tra (tile + heatmap).
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
  if (cameraId === 'HC-02' && opts.hc02MobileOnline) {
    reported = true
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
