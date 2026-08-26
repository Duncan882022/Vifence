/**
 * Flycam tuần tra (DR-*) — Module 05.
 *
 * Drone không đẩy được luồng thẳng vào trình duyệt: nguồn gốc là RTSP/RTMP, CMS
 * chỉ xem được HLS. Hai đường dẫn tới HLS đều chấp nhận, không phải chọn trước:
 *
 *  - MediaMTX phát lại path `dr-03` — drone (hoặc điện thoại cầm tay điều khiển)
 *    publish thẳng vào, không cần backend biết gì.
 *  - VMS relay `/stream/DR-03/index.m3u8` — drone push RTMP vào MediaMTX VPS
 *    (`rtmp://217.217.253.247:1935/dr-03`), backend pull `rtsp://127.0.0.1:8554/dr-03`.
 *
 * Tile thử VMS trước rồi rơi về MediaMTX, nên chỉ cần một trong hai đường sống.
 * Chưa có nguồn thật thì retry HLS ~8s rồi tile chuyển Offline (retry nền vẫn chạy).
 */
import { getVmsHlsUrl } from '@/modules/module02-training/data/trainingCameraFeeds'
import { getMediaMtxHlsBase } from './helmetIngest'

/** Camera thuộc nhóm flycam của Module 05. */
export const PATROL_DRONE_CAMERA_PREFIX = 'DR-'

export const PATROL_DRONE_IDS = ['DR-03'] as const

export const PATROL_DRONE_LABELS: Record<string, string> = {
  'DR-03': 'Drone 03',
}

export function isPatrolDroneCameraId(cameraId: string): boolean {
  return cameraId.startsWith(PATROL_DRONE_CAMERA_PREFIX)
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

/** Path trên MediaMTX — `DR-03` → `dr-03`. */
export function getPatrolDroneMediaMtxPath(cameraId: string): string {
  return readEnv(`VITE_${envSuffix(cameraId)}_PATH`) ?? cameraId.toLowerCase()
}

function getPatrolDroneMediaMtxHlsUrl(cameraId: string): string | undefined {
  const base = getMediaMtxHlsBase()
  if (!base) return undefined
  return `${base}/${getPatrolDroneMediaMtxPath(cameraId)}/index.m3u8`
}

/** HLS chính — override bằng env, mặc định là VMS relay. */
export function getPatrolDroneStreamUrl(cameraId: string): string | undefined {
  const override = readEnv(`VITE_${envSuffix(cameraId)}_STREAM_URL`)
  if (override) return override
  return getVmsHlsUrl(cameraId) ?? getPatrolDroneMediaMtxHlsUrl(cameraId)
}

/** HLS dự phòng — MediaMTX trực tiếp, dùng khi VMS relay chưa chạy. */
export function getPatrolDroneStreamFallbackUrl(cameraId: string): string | undefined {
  const mediaMtxHls = getPatrolDroneMediaMtxHlsUrl(cameraId)
  if (!mediaMtxHls || mediaMtxHls === getPatrolDroneStreamUrl(cameraId)) return undefined
  return mediaMtxHls
}
