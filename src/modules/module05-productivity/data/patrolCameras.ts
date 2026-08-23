import type { TrainingCamera } from '@/modules/module02-training/data/trainingCameras'
import type { PatrolHelmetCameraMetricsSlice } from '../services/patrolLiveEvents.service'
import { getPatrolHelmetStreamUrl } from './patrolHelmetStreams'

export type PatrolCameraFilterTab = 'Tất cả' | 'Online' | 'Offline'

export const PATROL_SITE_AREA = 'Cầu Sông Hốt'

const PATROL_BODY_CAMERAS: readonly { id: string; assignee: string; streamType: 'bodycam' | 'mobile' }[] = [
  { id: 'HC-01', assignee: 'Helmet 01', streamType: 'bodycam' },
  { id: 'HC-02', assignee: 'Duncan iPhone', streamType: 'mobile' },
]

function buildPatrolCamera(
  id: string,
  assignee: string,
  streamType: 'bodycam' | 'mobile',
): TrainingCamera {
  const streamUrl = streamType === 'bodycam' ? getPatrolHelmetStreamUrl(id) : undefined
  return {
    id,
    name: assignee,
    assignee,
    location: PATROL_SITE_AREA,
    zone: 'ZONE_A',
    status: 'offline',
    streamType,
    ...(streamUrl ? { streamUrl } : {}),
  }
}

/** Chỉ Helmet 01 + Duncan iPhone — khu Cầu Sông Hốt. */
export const PATROL_CAMERAS: TrainingCamera[] = PATROL_BODY_CAMERAS.map(
  ({ id, assignee, streamType }) => buildPatrolCamera(id, assignee, streamType),
)

export const DEFAULT_PATROL_CAMERA_IDS = ['HC-01', 'HC-02'] as const

export const PATROL_CAMERA_FILTER_TABS: PatrolCameraFilterTab[] = [
  'Tất cả',
  'Online',
  'Offline',
]

export function filterPatrolCameras(
  tab: PatrolCameraFilterTab,
  cameras: TrainingCamera[] = PATROL_CAMERAS,
): TrainingCamera[] {
  switch (tab) {
    case 'Online':
      return cameras.filter(c => c.status === 'online')
    case 'Offline':
      return cameras.filter(c => c.status === 'offline')
    default:
      return cameras
  }
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
    return { ...cam, status: online ? 'online' : 'offline' }
  })
}
