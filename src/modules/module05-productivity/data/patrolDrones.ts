/**
 * Flycam tuần tra (DR-*) — Module 05.
 *
 * Drone không đẩy được luồng thẳng vào trình duyệt: nguồn gốc là RTSP/RTMP, CMS
 * chỉ xem được HLS. Hai đường dẫn tới HLS đều chấp nhận, không phải chọn trước:
 *
 *  - MediaMTX phát lại path `dr03` — drone publish RTMP trực tiếp (HLS gốc, nét).
 *  - VMS relay `/stream/DR-03/index.m3u8` — backend pull RTSP để AI, re-encode 800k
 *    (chỉ dùng fallback khi MediaMTX chưa sẵn sàng).
 *
 * Tile ưu tiên MediaMTX HLS (không re-encode) rồi rơi về VMS relay.
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

/** Path trên MediaMTX — `DR-03` → `dr03` (không dấu gạch, DJI/OBS hay dùng). */
export function getPatrolDroneMediaMtxPath(cameraId: string): string {
  const fromEnv = readEnv(`VITE_${envSuffix(cameraId)}_PATH`)
  if (fromEnv) return fromEnv
  if (cameraId === 'DR-03') return 'dr03'
  return cameraId.toLowerCase()
}

function getPatrolDroneMediaMtxHlsUrl(cameraId: string): string | undefined {
  const base = getMediaMtxHlsBase()
  if (!base) return undefined
  return `${base}/${getPatrolDroneMediaMtxPath(cameraId)}/index.m3u8`
}

/** HLS chính — override bằng env, mặc định MediaMTX (không re-encode, nét hơn VMS relay). */
export function getPatrolDroneStreamUrl(cameraId: string): string | undefined {
  const override = readEnv(`VITE_${envSuffix(cameraId)}_STREAM_URL`)
  if (override) return override
  return getPatrolDroneMediaMtxHlsUrl(cameraId) ?? getVmsHlsUrl(cameraId)
}

/** HLS dự phòng — VMS relay, dùng khi MediaMTX HLS chưa sẵn sàng. */
export function getPatrolDroneStreamFallbackUrl(cameraId: string): string | undefined {
  const vmsHls = getVmsHlsUrl(cameraId)
  if (!vmsHls || vmsHls === getPatrolDroneStreamUrl(cameraId)) return undefined
  return vmsHls
}
