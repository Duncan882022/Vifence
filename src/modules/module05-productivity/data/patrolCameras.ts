import type { TrainingCamera } from '@/modules/module02-training/data/trainingCameras'
import { getStreamUrlForCamera } from '@/modules/module02-training/data/trainingCameraFeeds'
import { PATROL_HELMET_ZONE_ASSIGNMENTS } from './patrolSiteMap'

export type PatrolCameraFilterTab = 'Tất cả' | 'Online' | 'Offline'

const ZONE_LABELS: Record<string, string> = {
  ZONE_A: 'Khu thi công móng',
  ZONE_B: 'Khu lắp dựng tầng',
  ZONE_C: 'Khu hoàn thiện',
  ZONE_D: 'Khu kho vật tư',
  ZONE_E: 'Khu văn phòng công trường',
}

function buildPatrolCamera(id: string, zoneId: string, online: boolean): TrainingCamera {
  const num = id.replace('HC-', '')
  const streamUrl = online ? getStreamUrlForCamera(id) : undefined
  return {
    id,
    name: `Helmet ${num}`,
    location: `Phụ trách — ${ZONE_LABELS[zoneId] ?? zoneId}`,
    zone: zoneId,
    status: online ? 'online' : 'offline',
    streamType: 'bodycam',
    ...(streamUrl ? { streamUrl } : {}),
  }
}

/** 5 camera mũ — mỗi mũ phụ trách 1 khu (ZONE_A … ZONE_E). */
export const PATROL_CAMERAS: TrainingCamera[] = PATROL_HELMET_ZONE_ASSIGNMENTS.map(
  ({ helmetId, zoneId }) => buildPatrolCamera(helmetId, zoneId, true),
)

export const DEFAULT_PATROL_CAMERA_IDS = ['HC-01', 'HC-02'] as const

export const PATROL_CAMERA_FILTER_TABS: PatrolCameraFilterTab[] = [
  'Tất cả',
  'Online',
  'Offline',
]

export function filterPatrolCameras(tab: PatrolCameraFilterTab): TrainingCamera[] {
  switch (tab) {
    case 'Online':
      return PATROL_CAMERAS.filter(c => c.status === 'online')
    case 'Offline':
      return PATROL_CAMERAS.filter(c => c.status === 'offline')
    default:
      return PATROL_CAMERAS
  }
}

export function groupPatrolCamerasForSidebar(
  cameras: TrainingCamera[],
): { key: string; cameras: TrainingCamera[] }[] {
  const byZone = PATROL_HELMET_ZONE_ASSIGNMENTS.map(({ zoneId, helmetId }) => {
    const cam = cameras.find(c => c.id === helmetId)
    return cam ? { zoneId, cam } : null
  }).filter((x): x is { zoneId: string; cam: TrainingCamera } => !!x)

  if (byZone.length === 0) {
    return [{ key: 'Helmet', cameras }]
  }

  return byZone.map(({ zoneId, cam }) => ({
    key: ZONE_LABELS[zoneId]?.split(' ').slice(-2).join(' ') ?? zoneId,
    cameras: [cam],
  }))
}
