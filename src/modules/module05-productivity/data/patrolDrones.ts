/**
 * Flycam tuần tra (DR-*) — Module 05.
 *
 * Nguồn gốc RTSP/RTMP → MediaMTX path `dr03` → CMS xem WHEP / LL-HLS.
 * Không dùng VMS relay `/stream/DR-*` (backend trả 503 cho patrol ids).
 */
import { getMediaMtxHlsBase, getMediaMtxWebrtcBase, mediaMtxPathForCamera } from './helmetIngest'
import type { PatrolFlightMode } from '../utils/patrolFlightMode'

/** Camera thuộc nhóm flycam của Module 05. */
export const PATROL_DRONE_CAMERA_PREFIX = 'DR-'

export const PATROL_DRONE_IDS = ['DR-03'] as const

export const PATROL_DRONE_LABELS: Record<string, string> = {
  'DR-03': 'Drone 03',
}

/** Flycam tầm cao + online — accent sky (tile LIVE, pin map, route). */
export const PATROL_DRONE_AERIAL_ACTIVE_HEX = '#38bdf8'

export function isPatrolDroneCameraId(cameraId: string): boolean {
  return cameraId.startsWith(PATROL_DRONE_CAMERA_PREFIX)
}

export function patrolDroneMapAccent(
  cameraId: string,
  isActive: boolean,
  flightMode: PatrolFlightMode | string | null | undefined,
  fallbackColor: string,
): string {
  if (!isActive || !isPatrolDroneCameraId(cameraId)) return fallbackColor
  if ((flightMode ?? 'aerial') === 'aerial') return PATROL_DRONE_AERIAL_ACTIVE_HEX
  return fallbackColor
}

/** DR-* — ROI người luôn bật trên tile; không tắt qua bbox toggle. */
export function isPatrolDroneRoiMandatory(cameraId: string): boolean {
  return isPatrolDroneCameraId(cameraId)
}

function readEnv(key: string): string | undefined {
  const raw = import.meta.env[key as keyof ImportMetaEnv]
  return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined
}

/** `DR-03` → `DR03` — dùng dựng tên biến env. */
function envSuffix(cameraId: string): string {
  return cameraId.replace(/-/g, '')
}

/**
 * RTSP gốc của flycam — backend pull về để relay HLS và chạy AI.
 * Browser không phát trực tiếp được, giá trị này chỉ để tham chiếu/hiển thị.
 */
export function getPatrolDroneRtspSource(cameraId: string): string | undefined {
  return readEnv(`VITE_${envSuffix(cameraId)}_RTSP_URL`)
}

/** Path trên MediaMTX — đồng bộ với playback (`mediaMtxPathForCamera`). */
export function getPatrolDroneMediaMtxPath(cameraId: string): string {
  const fromEnv = readEnv(`VITE_${envSuffix(cameraId)}_PATH`)
  if (fromEnv) return fromEnv
  return mediaMtxPathForCamera(cameraId)
}

function getPatrolDroneMediaMtxHlsUrl(cameraId: string): string | undefined {
  const base = getMediaMtxHlsBase()
  if (!base) return undefined
  return `${base}/${getPatrolDroneMediaMtxPath(cameraId)}/index.m3u8`
}

/** WHEP WebRTC — độ trễ ~200–500ms, ưu tiên hơn LL-HLS. */
export function getPatrolDroneWhepUrl(cameraId: string): string | undefined {
  const base = getMediaMtxWebrtcBase()
  if (!base) return undefined
  return `${base}/${getPatrolDroneMediaMtxPath(cameraId)}/whep`
}

/** HLS chính — override env, mặc định MediaMTX (không re-encode VMS relay 503). */
export function getPatrolDroneStreamUrl(cameraId: string): string | undefined {
  const override = readEnv(`VITE_${envSuffix(cameraId)}_STREAM_URL`)
  if (override) return override
  return getPatrolDroneMediaMtxHlsUrl(cameraId)
}
