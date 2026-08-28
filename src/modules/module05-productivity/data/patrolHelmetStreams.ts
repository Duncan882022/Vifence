/**
 * Helmet camera live streams — MediaMTX pipeline thống nhất.
 *
 * Mọi camera tuần tra (HC-*, DR-*) xem live qua CameraVideoFeed:
 *   1. WHEP WebRTC (~200–500ms)
 *   2. MediaMTX LL-HLS (~1–2s) — fallback UDP/firewall
 *
 * JSMpeg (Vision wsUrl) chỉ còn khi chưa cấu hình MediaMTX.
 */
import { getVmsHlsUrl } from '@/modules/module02-training/data/trainingCameraFeeds'
import { getHelmetIngest, getHelmetMediaMtxHlsUrl, isHelmetWebrtcAvailable, isLegacyMobileHelmet } from './helmetIngest'
import { isPatrolMetricsCameraId } from './patrolHelmetScope'

function readEnv(key: string): string | undefined {
  const raw = import.meta.env[key as keyof ImportMetaEnv]
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined
}

/** RTSP path suffix — khớp camera Vision API (nguồn: helmetIngest). */
function getPatrolHelmetRtspPath(cameraId: string): string | undefined {
  const rtsp = getHelmetIngest(cameraId).rtspUrl
  if (!rtsp) return undefined
  try {
    return new URL(rtsp).pathname.replace(/^\//, '')
  } catch {
    return undefined
  }
}

/**
 * HLS chính — override env, mặc định MediaMTX LL-HLS (không re-encode VMS).
 * Patrol HC/DR không có fallback MP4 demo — không nguồn thì tile Offline.
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

  // VMS relay chỉ cho id ngoài HC/DR — patrol trả undefined thay vì /stream/503.
  return getVmsHlsUrl(cameraId)
}

/**
 * Gỡ wsUrl — mọi camera tuần tra xem qua MediaMTX (WHEP → LL-HLS).
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
