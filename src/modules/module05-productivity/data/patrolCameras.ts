import type { TrainingCamera } from '@/modules/module02-training/data/trainingCameras'
import type { PatrolHelmetCameraMetricsSlice } from '../services/patrolLiveEvents.service'
import { PATROL_SITE_NAME, PATROL_SITE_ZONE_ID } from './patrolSiteMap'
import { getPatrolHelmetStreamUrl } from './patrolHelmetStreams'
import { getHelmetWhepUrl, isLegacyMobileHelmet } from './helmetIngest'
import { resolvePatrolCameraOnlineState } from '../utils/patrolStreamOnline'
import {
  PATROL_DRONE_IDS,
  PATROL_DRONE_LABELS,
  getPatrolDroneStreamUrl,
  getPatrolDroneWhepUrl,
} from './patrolDrones'

export type PatrolCameraFilterTab = 'Bodycam' | 'Flycam'

export const PATROL_SITE_AREA = PATROL_SITE_NAME

const PATROL_BODY_CAMERAS: readonly { id: string; assignee: string }[] = [
  { id: 'HC-01', assignee: 'Helmet 01' },
  { id: 'HC-02', assignee: 'Helmet 02' },
]

const ALL_PATROL_BODYCAM_IDS = PATROL_BODY_CAMERAS.map(row => row.id)

/** Build-time: `VITE_PATROL_CAMERA_IDS=HC-01` — chỉ Helmet 01, bỏ HC-02/DR-03 khỏi UI. */
function readPatrolCameraIdsFromEnv(): readonly string[] | null {
  const raw = import.meta.env.VITE_PATROL_CAMERA_IDS?.trim()
  if (!raw) return null
  const ids = raw.split(',').map((part: string) => part.trim()).filter(Boolean)
  return ids.length > 0 ? ids : null
}

const ENV_PATROL_CAMERA_IDS = readPatrolCameraIdsFromEnv()

/** Bodycam ids đang bật — mặc định cả hai mũ; production Helmet 01 only qua env. */
export const DEFAULT_PATROL_CAMERA_IDS: readonly string[] =
  ENV_PATROL_CAMERA_IDS?.filter(id => ALL_PATROL_BODYCAM_IDS.includes(id))
  ?? ALL_PATROL_BODYCAM_IDS

const INCLUDE_PATROL_DRONES =
  import.meta.env.VITE_PATROL_INCLUDE_DRONES !== '0'
  && (ENV_PATROL_CAMERA_IDS == null || ENV_PATROL_CAMERA_IDS.some(id => id.startsWith('DR-')))

/** Camera mở sẵn trên lưới — mặc định gồm flycam trừ khi tắt bằng env. */
export const DEFAULT_PATROL_GRID_CAMERA_IDS: readonly string[] = [
  ...DEFAULT_PATROL_CAMERA_IDS,
  ...(INCLUDE_PATROL_DRONES ? PATROL_DRONE_IDS : []),
]

/**
 * `streamType` suy ra từ cấu hình ingest, không hardcode theo id.
 * Mũ nào cũng là bodycam trừ khi còn phải chạy luồng cũ (chưa có MediaMTX).
 */
function resolveStreamType(id: string): 'bodycam' | 'mobile' {
  return isLegacyMobileHelmet(id) ? 'mobile' : 'bodycam'
}

function buildPatrolCamera(id: string, assignee: string): TrainingCamera {
  const streamType = resolveStreamType(id)
  const streamUrl = streamType === 'bodycam' ? getPatrolHelmetStreamUrl(id) : undefined
  const whepUrl = streamType === 'bodycam' ? getHelmetWhepUrl(id) : undefined

  return {
    id,
    name: assignee,
    assignee,
    location: PATROL_SITE_NAME,
    zone: PATROL_SITE_ZONE_ID,
    status: 'offline',
    streamType,
    ...(streamUrl ? { streamUrl } : {}),
    ...(whepUrl ? { whepUrl } : {}),
  }
}

/**
 * Flycam chưa có nguồn: tile thử HLS, hiện "Đang chờ tín hiệu" ~8s rồi Offline.
 * Có nguồn thì tự lên sóng — retry nền vẫn chạy sau khi đã Offline.
 */
function buildPatrolDroneCamera(id: string): TrainingCamera {
  const name = PATROL_DRONE_LABELS[id] ?? id
  const streamUrl = getPatrolDroneStreamUrl(id)
  const whepUrl = getPatrolDroneWhepUrl(id)

  return {
    id,
    name,
    assignee: name,
    location: PATROL_SITE_NAME,
    zone: PATROL_SITE_ZONE_ID,
    status: 'offline',
    streamType: 'flycam',
    ...(streamUrl ? { streamUrl } : {}),
    ...(whepUrl ? { whepUrl } : {}),
  }
}

/** Helmet 01 (+ tuỳ chọn HC-02, DR-03) — khu Cầu Sông Hốt. */
function activePatrolBodyCameras(): readonly { id: string; assignee: string }[] {
  if (!ENV_PATROL_CAMERA_IDS) return PATROL_BODY_CAMERAS
  const allowed = new Set(
    ENV_PATROL_CAMERA_IDS.filter(id => ALL_PATROL_BODYCAM_IDS.includes(id)),
  )
  return PATROL_BODY_CAMERAS.filter(row => allowed.has(row.id))
}

function activePatrolDroneIds(): readonly string[] {
  if (!INCLUDE_PATROL_DRONES) return []
  if (!ENV_PATROL_CAMERA_IDS) return PATROL_DRONE_IDS
  return PATROL_DRONE_IDS.filter(id => ENV_PATROL_CAMERA_IDS!.includes(id))
}

export const PATROL_CAMERAS: TrainingCamera[] = [
  ...activePatrolBodyCameras().map(({ id, assignee }) => buildPatrolCamera(id, assignee)),
  ...activePatrolDroneIds().map(id => buildPatrolDroneCamera(id)),
]

export const PATROL_BODYCAM_LABELS: Record<string, string> = {
  'HC-01': 'Helmet 01',
  'HC-02': 'Helmet 02',
}

/** Tên hiển thị camera ghi nhận sự kiện — bodycam + flycam. */
export function resolvePatrolCameraDisplayName(cameraId: string): string {
  const id = cameraId.trim()
  if (!id) return ''
  return PATROL_BODYCAM_LABELS[id] ?? PATROL_DRONE_LABELS[id] ?? id
}

/** Mũ tuần tra — danh sách KPI / workforce (backend chỉ nhận HC-*). */

export const PATROL_CAMERA_FILTER_TABS: PatrolCameraFilterTab[] = ['Bodycam', 'Flycam']

function patrolCameraTab(camera: TrainingCamera): PatrolCameraFilterTab {
  return camera.streamType === 'flycam' ? 'Flycam' : 'Bodycam'
}

export function filterPatrolCameras(
  tab: PatrolCameraFilterTab,
  cameras: TrainingCamera[] = PATROL_CAMERAS,
): TrainingCamera[] {
  return cameras.filter(cam => patrolCameraTab(cam) === tab)
}

export function groupPatrolCamerasForSidebar(
  cameras: TrainingCamera[],
): { key: string; cameras: TrainingCamera[] }[] {
  return PATROL_CAMERA_FILTER_TABS
    .map(key => ({ key, cameras: cameras.filter(cam => patrolCameraTab(cam) === key) }))
    .filter(group => group.cameras.length > 0)
}

/**
 * Gắn online/offline thật từ metrics backend + bridge HC-02 mobile.
 *
 * Camera không có dòng nào trong `perCamera` nghĩa là chưa hỏi được backend,
 * không phải đã tắt: để `streamOfflineConfirmed` false cho tile cứ thử tải.
 * Backend sập thì thà tile tự dò còn hơn cả lưới đen mà không ai biết vì sao.
 */
export function applyPatrolCameraStreamStatus(
  cameras: TrainingCamera[],
  perCamera: PatrolHelmetCameraMetricsSlice[],
  framesLiveById?: ReadonlyMap<string, boolean>,
): TrainingCamera[] {
  return cameras.map(cam => {
    const { online, framesLive, streamOfflineConfirmed } = resolvePatrolCameraOnlineState(
      cam.id,
      perCamera,
      { framesLiveById },
    )
    return {
      ...cam,
      status: online ? 'online' as const : 'offline' as const,
      framesLive,
      streamOfflineConfirmed,
    }
  })
}
