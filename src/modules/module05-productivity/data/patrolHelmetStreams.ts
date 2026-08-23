/**
 * Helmet camera live streams — RTSP nguồn + HLS cho browser.
 * HC-01: bodycam RTSP trên MediaMTX (157.66.100.182).
 */
import {
  getStreamUrlForCamera,
  getVmsHlsUrl,
} from '@/modules/module02-training/data/trainingCameraFeeds'

/** RTSP pull — port 8554 (browser không phát RTSP trực tiếp → dùng VMS HLS relay). */
export const PATROL_HELMET_RTSP_SOURCES: Record<string, string> = {
  'HC-01': 'rtsp://157.66.100.182:8554/866926048126907',
}

const MEDIAMTX_HLS_PORT =
  (import.meta.env.VITE_MEDIAMTX_HLS_PORT as string | undefined)?.trim() || '8888'

/** Chuyển RTSP MediaMTX → HLS cùng path (port 8888 mặc định). */
export function getMediaMtxHlsFromRtsp(rtspUrl: string): string | undefined {
  try {
    const u = new URL(rtspUrl)
    const path = u.pathname.replace(/^\//, '')
    if (!path) return undefined
    return `http://${u.hostname}:${MEDIAMTX_HLS_PORT}/${path}/index.m3u8`
  } catch {
    return undefined
  }
}

/**
 * URL phát live cho helmet:
 * - HC-01: VITE_HC01_STREAM_URL hoặc VMS HLS relay (Contabo) — không fallback MP4 mock
 * - HC-02: mobile only (MobileCameraFeed) — không MP4 mock
 * - HC-03…: MP4 demo (nếu chưa có nguồn live)
 */
export function getPatrolHelmetStreamUrl(cameraId: string): string | undefined {
  if (cameraId === 'HC-01') {
    const override = (import.meta.env.VITE_HC01_STREAM_URL as string | undefined)?.trim()
    if (override) return override
    return getVmsHlsUrl('HC-01')
  }

  if (cameraId === 'HC-02') {
    return undefined
  }

  return getStreamUrlForCamera(cameraId)
}

/** RTSP path suffix — khớp camera Vision API (vd 866926048126907). */
export function getPatrolHelmetRtspPath(cameraId: string): string | undefined {
  const rtsp = PATROL_HELMET_RTSP_SOURCES[cameraId]
  if (!rtsp) return undefined
  try {
    return new URL(rtsp).pathname.replace(/^\//, '')
  } catch {
    return undefined
  }
}

/** Gắn wsUrl live từ Vision API (cùng luồng vifence.io/dao-tao-tuan-thu). */
export function mergePatrolCamerasWithVisionLive<T extends { id: string; streamUrl?: string; wsUrl?: string | null }>(
  cameras: T[],
  apiCameras: Array<{ id: string; rtspUrl?: string; wsUrl?: string | null }>,
): T[] {
  return cameras.map(cam => {
    const path = getPatrolHelmetRtspPath(cam.id)
    if (!path) return cam
    const live = apiCameras.find(
      c => c.wsUrl && (c.rtspUrl?.includes(path) || c.id === cam.id),
    )
    if (!live?.wsUrl) return cam
    return { ...cam, wsUrl: live.wsUrl, streamUrl: undefined }
  })
}

/** Override HC-01 wsUrl từ env — dùng khi local dev không gọi được Vision API (CORS). */
export function applyPatrolHelmetEnvLive<T extends { id: string; streamUrl?: string; wsUrl?: string | null }>(
  cameras: T[],
): T[] {
  const hc01Ws = (import.meta.env.VITE_HC01_WS_URL as string | undefined)?.trim()
  if (!hc01Ws) return cameras
  return cameras.map(cam =>
    cam.id === 'HC-01' && !cam.wsUrl
      ? { ...cam, wsUrl: hc01Ws, streamUrl: undefined }
      : cam,
  )
}

/** HC-02 luôn mobile — gỡ streamUrl/wsUrl mock nếu catalog cũ còn gắn MP4. */
export function applyPatrolHelmetMobileLive<
  T extends {
    id: string
    streamType?: string
    streamUrl?: string
    wsUrl?: string | null
    assignee?: string
  },
>(cameras: T[]): T[] {
  return cameras.map(cam => {
    if (cam.id !== 'HC-02') return cam
    return {
      ...cam,
      streamType: 'mobile',
      assignee: cam.assignee ?? 'Helmet 02',
      streamUrl: undefined,
      wsUrl: undefined,
    }
  })
}
