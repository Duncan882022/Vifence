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
import { getMediaMtxHlsBase, getMediaMtxWebrtcBase, mediaMtxPathForCamera } from './helmetIngest'
import { isVmsHlsRelayEnabled } from './patrolHelmetScope'

/** Camera thuộc nhóm flycam của Module 05. */
export const PATROL_DRONE_CAMERA_PREFIX = 'DR-'

export const PATROL_DRONE_IDS = ['DR-03'] as const

export const PATROL_DRONE_LABELS: Record<string, string> = {
  'DR-03': 'Drone 03',
}

export function isPatrolDroneCameraId(cameraId: string): boolean {
  return cameraId.startsWith(PATROL_DRONE_CAMERA_PREFIX)
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

/** HLS chính — override bằng env, mặc định MediaMTX (không re-encode, nét hơn VMS relay). */
export function getPatrolDroneStreamUrl(cameraId: string): string | undefined {
  const override = readEnv(`VITE_${envSuffix(cameraId)}_STREAM_URL`)
  if (override) return override
  return getPatrolDroneMediaMtxHlsUrl(cameraId) ?? getVmsHlsUrl(cameraId)
}

/**
 * HLS dự phòng — chỉ khi backend còn relay `/stream/<cam>/`.
 * Worker đã bỏ re-encode cho DR-*, nên mặc định không có nguồn thứ hai.
 */
export function getPatrolDroneStreamFallbackUrl(cameraId: string): string | undefined {
  if (!isVmsHlsRelayEnabled(cameraId)) return undefined
  const vmsHls = getVmsHlsUrl(cameraId)
  if (!vmsHls || vmsHls === getPatrolDroneStreamUrl(cameraId)) return undefined
  return vmsHls
}
