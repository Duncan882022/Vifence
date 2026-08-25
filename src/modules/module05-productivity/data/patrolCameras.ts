import type { TrainingCamera } from '@/modules/module02-training/data/trainingCameras'
import type { PatrolHelmetCameraMetricsSlice } from '../services/patrolLiveEvents.service'
import { PATROL_SITE_NAME, PATROL_SITE_ZONE_ID } from './patrolSiteMap'
import { getPatrolHelmetStreamUrl, getPatrolHelmetStreamFallbackUrl } from './patrolHelmetStreams'
import { isLegacyMobileHelmet } from './helmetIngest'

export type PatrolCameraFilterTab = 'Bodycam'

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
  // CMS xem qua backend HLS relay — WHEP để dành cho tối ưu latency sau;
  // hiện WHEP hay báo connected nhưng màn đen trên desktop viewer.

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
  }
}

/** Chỉ Helmet 01 + Helmet 02 — khu Cầu Sông Hốt. */
export const PATROL_CAMERAS: TrainingCamera[] = PATROL_BODY_CAMERAS.map(
  ({ id, assignee }) => buildPatrolCamera(id, assignee),
)

export const PATROL_BODYCAM_LABELS: Record<string, string> = {
  'HC-01': 'Helmet 01',
  'HC-02': 'Helmet 02',
}

export const DEFAULT_PATROL_CAMERA_IDS = ['HC-01', 'HC-02'] as const

export const PATROL_CAMERA_FILTER_TABS: PatrolCameraFilterTab[] = ['Bodycam']

/** Tab Bodycam — luôn trả cả Helmet 01 + Helmet 02. */
export function filterPatrolCameras(
  _tab: PatrolCameraFilterTab,
  cameras: TrainingCamera[] = PATROL_CAMERAS,
): TrainingCamera[] {
  return cameras
}

export function groupPatrolCamerasForSidebar(
  cameras: TrainingCamera[],
): { key: string; cameras: TrainingCamera[] }[] {
  if (cameras.length === 0) return []
  return [{ key: 'Bodycam', cameras }]
}

/** Gắn online/offline thật từ metrics backend + bridge HC-02 mobile. */
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
    const online = onlineById.get(cam.id) ?? false
    return { ...cam, status: online ? 'online' as const : 'offline' as const }
  })
}
