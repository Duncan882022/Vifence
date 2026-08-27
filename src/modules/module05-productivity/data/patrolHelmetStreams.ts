/**
 * Helmet camera live streams — MediaMTX pipeline thống nhất.
 *
 * Mọi camera tuần tra (HC-*, DR-*) xem live qua CameraVideoFeed:
 *   1. WHEP WebRTC (~200–500ms)
 *   2. MediaMTX LL-HLS (~1–2s) — fallback UDP/firewall
 *
 * JSMpeg (Vision wsUrl) và VMS relay HLS chỉ còn khi chưa cấu hình MediaMTX.
 * Cùng tab đang phát WHIP → local MediaStream (không qua server).
 */
import {
  getStreamUrlForCamera,
  getVmsHlsUrl,
} from '@/modules/module02-training/data/trainingCameraFeeds'
import { getHelmetMediaMtxHlsUrl, isHelmetWebrtcAvailable, isLegacyMobileHelmet } from './helmetIngest'
import { isPatrolMetricsCameraId, isVmsHlsRelayEnabled } from './patrolHelmetScope'

/** RTSP pull — port 8554 (browser không phát RTSP trực tiếp → backend pull qua MediaMTX). */
export const PATROL_HELMET_RTSP_SOURCES: Record<string, string> = {
  'HC-01': 'rtsp://157.66.100.182:8554/866926048126915',
}

const MEDIAMTX_HLS_PORT =
  (import.meta.env.VITE_MEDIAMTX_HLS_PORT as string | undefined)?.trim() || '8888'

function readEnv(key: string): string | undefined {
  const raw = import.meta.env[key as keyof ImportMetaEnv]
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined
}

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
 * HLS chính — override env, mặc định MediaMTX LL-HLS (không re-encode VMS).
 */
export function getPatrolHelmetStreamUrl(cameraId: string): string | undefined {
  const envKey = `VITE_${cameraId.replace('-', '')}_STREAM_URL`
  const override = readEnv(envKey)
  if (override) return override

  if (isLegacyMobileHelmet(cameraId)) {
    return undefined
  }

  const mediaMtxHls = getHelmetMediaMtxHlsUrl(cameraId)
  if (mediaMtxHls) return mediaMtxHls

  return getVmsHlsUrl(cameraId) ?? getStreamUrlForCamera(cameraId)
}

/**
 * HLS dự phòng — chỉ khi backend còn relay `/stream/<cam>/`.
 *
 * Từ khi worker bỏ re-encode cho camera tuần tra, endpoint đó trả 503 vĩnh viễn.
 * Trỏ fallback vào đấy khiến watchdog luân phiên hai nguồn và gắn lại hls.js
 * mỗi vài giây — chính là hiện tượng giật ngắt quãng đều đặn khi xem live.
 */
export function getPatrolHelmetStreamFallbackUrl(cameraId: string): string | undefined {
  if (isLegacyMobileHelmet(cameraId)) return undefined
  if (!isVmsHlsRelayEnabled(cameraId)) return undefined
  const primary = getPatrolHelmetStreamUrl(cameraId)
  const vmsHls = getVmsHlsUrl(cameraId)
  if (!vmsHls || vmsHls === primary) return undefined
  return vmsHls
}

/** RTSP path suffix — khớp camera Vision API (vd 866926048126915). */
export function getPatrolHelmetRtspPath(cameraId: string): string | undefined {
  const rtsp = PATROL_HELMET_RTSP_SOURCES[cameraId]
  if (!rtsp) return undefined
  try {
    return new URL(rtsp).pathname.replace(/^\//, '')
  } catch {
    return undefined
  }
}

/**
 * Gỡ wsUrl / fallback VMS — mọi camera tuần tra xem qua MediaMTX (WHEP → LL-HLS).
 * Gọi sau các bước merge env/Vision để không còn nhánh JSMpeg song song.
 */
export function applyPatrolUnifiedLiveRouting<
  T extends {
    id: string
    streamUrl?: string
    wsUrl?: string | null
    whepUrl?: string
    streamFallbackUrl?: string
  },
>(cameras: T[]): T[] {
  if (!isHelmetWebrtcAvailable()) return cameras
  return cameras.map(cam => {
    if (!isPatrolMetricsCameraId(cam.id)) return cam
    return {
      ...cam,
      wsUrl: undefined,
      streamFallbackUrl: undefined,
    }
  })
}

/** Gắn wsUrl live từ Vision API — chỉ khi chưa có MediaMTX (dev / fallback cũ). */
export function mergePatrolCamerasWithVisionLive<T extends { id: string; streamUrl?: string; wsUrl?: string | null }>(
  cameras: T[],
  apiCameras: Array<{ id: string; rtspUrl?: string; wsUrl?: string | null }>,
): T[] {
  if (isHelmetWebrtcAvailable()) return cameras
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

/** Override HC-01 wsUrl từ env — chỉ khi chưa có MediaMTX (local dev / CORS). */
export function applyPatrolHelmetEnvLive<T extends { id: string; streamUrl?: string; wsUrl?: string | null }>(
  cameras: T[],
): T[] {
  if (isHelmetWebrtcAvailable()) return cameras
  const hc01Ws = readEnv('VITE_HC01_WS_URL')
  if (!hc01Ws) return cameras
  return cameras.map(cam =>
    cam.id === 'HC-01' && !cam.wsUrl
      ? { ...cam, wsUrl: hc01Ws, streamUrl: undefined }
      : cam,
  )
}

/**
 * Ép mobile cho mũ còn chạy luồng cũ — gỡ streamUrl/wsUrl mock nếu catalog cũ gắn MP4.
 */
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
    if (!isLegacyMobileHelmet(cam.id)) return cam
    return {
      ...cam,
      streamType: 'mobile',
      assignee: cam.assignee ?? PATROL_BODYCAM_FALLBACK_LABEL[cam.id] ?? cam.assignee,
      streamUrl: undefined,
      wsUrl: undefined,
    }
  })
}

const PATROL_BODYCAM_FALLBACK_LABEL: Record<string, string> = {
  'HC-02': 'Helmet 02',
}
