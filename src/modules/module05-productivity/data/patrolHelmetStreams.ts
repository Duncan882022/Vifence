/**
 * Helmet camera live streams — RTSP nguồn + HLS cho browser.
 * HC-01: bodycam RTSP trên MediaMTX (157.66.100.182).
 */
import {
  getStreamUrlForCamera,
  getVmsHlsUrl,
} from '@/modules/module02-training/data/trainingCameraFeeds'

/** RTSP pull — nguồn thật từ camera/mũ. */
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
 * URL phát live cho helmet — ưu tiên:
 * 1. VITE_HC01_STREAM_URL (override build)
 * 2. HLS MediaMTX từ RTSP map
 * 3. VMS backend /stream/{id}/index.m3u8
 * 4. MP4 demo local
 */
export function getPatrolHelmetStreamUrl(cameraId: string): string | undefined {
  if (cameraId === 'HC-01') {
    const override = (import.meta.env.VITE_HC01_STREAM_URL as string | undefined)?.trim()
    if (override) return override
  }

  const rtsp = PATROL_HELMET_RTSP_SOURCES[cameraId]
  if (rtsp) {
    const mtxHls = getMediaMtxHlsFromRtsp(rtsp)
    if (mtxHls) return mtxHls
  }

  const vmsHls = getVmsHlsUrl(cameraId)
  if (vmsHls && (import.meta.env.VITE_VMS_BACKEND_URL as string | undefined)?.trim()) {
    return vmsHls
  }

  return getStreamUrlForCamera(cameraId)
}
