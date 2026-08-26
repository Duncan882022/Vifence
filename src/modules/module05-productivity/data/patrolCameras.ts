import type { TrainingCamera } from '@/modules/module02-training/data/trainingCameras'
import type { PatrolHelmetCameraMetricsSlice } from '../services/patrolLiveEvents.service'
import { PATROL_SITE_NAME, PATROL_SITE_ZONE_ID } from './patrolSiteMap'
import { getPatrolHelmetStreamUrl, getPatrolHelmetStreamFallbackUrl } from './patrolHelmetStreams'
import { getHelmetWhepUrl, isLegacyMobileHelmet } from './helmetIngest'
import {
  PATROL_DRONE_IDS,
  PATROL_DRONE_LABELS,
  getPatrolDroneStreamFallbackUrl,
  getPatrolDroneStreamUrl,
  getPatrolDroneWhepUrl,
} from './patrolDrones'

export type PatrolCameraFilterTab = 'Bodycam' | 'Flycam'

export const PATROL_SITE_AREA = PATROL_SITE_NAME

const PATROL_BODY_CAMERAS: readonly { id: string; assignee: string }[] = [
  { id: 'HC-01', assignee: 'Helmet 01' },
  { id: 'HC-02', assignee: 'Helmet 02' },
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
  const streamFallbackUrl = streamType === 'bodycam' ? getPatrolHelmetStreamFallbackUrl(id) : undefined
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
    ...(streamFallbackUrl ? { streamFallbackUrl } : {}),
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
  const streamFallbackUrl = getPatrolDroneStreamFallbackUrl(id)
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
    ...(streamFallbackUrl ? { streamFallbackUrl } : {}),
    ...(whepUrl ? { whepUrl } : {}),
  }
}

/** Helmet 01 + Helmet 02 + Drone 03 — khu Cầu Sông Hốt. */
export const PATROL_CAMERAS: TrainingCamera[] = [
  ...PATROL_BODY_CAMERAS.map(({ id, assignee }) => buildPatrolCamera(id, assignee)),
  ...PATROL_DRONE_IDS.map(id => buildPatrolDroneCamera(id)),
]

export const PATROL_BODYCAM_LABELS: Record<string, string> = {
  'HC-01': 'Helmet 01',
  'HC-02': 'Helmet 02',
}

/** Mũ tuần tra — danh sách dùng cho KPI, sự kiện và workforce (backend chỉ nhận HC-*). */
export const DEFAULT_PATROL_CAMERA_IDS = ['HC-01', 'HC-02'] as const

/** Camera mở sẵn trên lưới — gồm cả flycam. */
export const DEFAULT_PATROL_GRID_CAMERA_IDS: readonly string[] = [
  ...DEFAULT_PATROL_CAMERA_IDS,
  ...PATROL_DRONE_IDS,
]

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
  hc02MobileOnline = false,
): TrainingCamera[] {
  const onlineById = new Map<string, boolean>()
  for (const row of perCamera) {
    onlineById.set(row.camera_id, Boolean(row.stream_online))
  }
  if (hc02MobileOnline) onlineById.set('HC-02', true)

  return cameras.map(cam => {
    const reported = onlineById.get(cam.id)
    const online = reported ?? false
    return {
      ...cam,
      status: online ? 'online' as const : 'offline' as const,
      streamOfflineConfirmed: reported === false,
    }
  })
}
