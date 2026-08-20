import type { TrainingCamera } from '@/modules/module02-training/data/trainingCameras'
import { getStreamUrlForCamera } from '@/modules/module02-training/data/trainingCameraFeeds'

export type PatrolCameraFilterTab = 'Tất cả' | 'Online' | 'Offline'

/** Camera mũ bảo hộ — POC dùng clip bodycam (9:16) */
export const PATROL_CAMERAS: TrainingCamera[] = [
  {
    id: 'HC-01',
    name: 'Helmet 01',
    location: 'Zone A — Khu thi công móng',
    zone: 'ZONE_A',
    status: 'online',
    streamType: 'bodycam',
    streamUrl: getStreamUrlForCamera('HC-01'),
  },
  {
    id: 'HC-02',
    name: 'Helmet 02',
    location: 'Zone C — Khu hoàn thiện',
    zone: 'ZONE_C',
    status: 'online',
    streamType: 'bodycam',
    streamUrl: getStreamUrlForCamera('HC-02'),
  },
  {
    id: 'HC-03',
    name: 'Helmet 03',
    location: 'Zone B — Khu lắp dựng tầng',
    zone: 'ZONE_B',
    status: 'offline',
    streamType: 'bodycam',
  },
]

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
  const online = cameras.filter(c => c.status === 'online')
  const offline = cameras.filter(c => c.status === 'offline')
  const groups: { key: string; cameras: TrainingCamera[] }[] = []
  if (online.length > 0) groups.push({ key: 'Đang tuần tra', cameras: online })
  if (offline.length > 0) groups.push({ key: 'Offline', cameras: offline })
  return groups.length > 0 ? groups : [{ key: 'Helmet', cameras }]
}
