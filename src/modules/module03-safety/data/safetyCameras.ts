import type { TrainingCamera } from '@/modules/module02-training/data/trainingCameras'
import { getStreamUrlForCamera } from '@/modules/module02-training/data/trainingCameraFeeds'

/** Zone camera công trường Giảng Võ — Module 03 ATLĐ */
export type SafetyCameraZone = 'TTDV-A'

export type SafetyCameraFilterTab = 'Tất cả' | SafetyCameraZone | 'Mobile'

/** Camera cố định TTDV-A — chỉ Cam 03 + Cam 04 */
const FIXED_CAMERAS: TrainingCamera[] = [
  {
    id: 'A-03',
    name: 'Cam 03',
    location: 'Block T.Bắc — Mép biên',
    zone: 'TTDV-A',
    status: 'online',
    streamType: 'fixed',
    streamUrl: getStreamUrlForCamera('A-03'),
  },
  {
    id: 'A-04',
    name: 'Cam 04',
    location: 'Block T.Bắc — Lồng thang',
    zone: 'TTDV-A',
    status: 'online',
    streamType: 'fixed',
    streamUrl: getStreamUrlForCamera('A-04'),
  },
]

/**
 * Mobile Duncan — luồng trực tiếp từ thiết bị (getUserMedia), không dùng clip mock.
 * MOB-01 ưu tiên iPhone / Continuity Camera.
 */
const MOBILE_CAMERAS: TrainingCamera[] = [
  {
    id: 'MOB-01',
    name: 'Duncan IPhone',
    location: 'Di động — Hiện trường',
    zone: '',
    status: 'online',
    streamType: 'mobile',
    assignee: 'Duncan IPhone',
  },
]

/** Camera mặc định hiển thị khi mở Module 03 — Cam 03 + Cam 04 (TTDV-A) */
export const DEFAULT_SAFETY_CAMERA_IDS = ['A-03', 'A-04'] as const

/** Camera live Module 03 — Cam 03, Cam 04, Mobile Duncan */
export const SAFETY_CAMERAS: TrainingCamera[] = [
  ...FIXED_CAMERAS,
  ...MOBILE_CAMERAS,
]

export const SAFETY_CAMERA_FILTER_TABS: SafetyCameraFilterTab[] = [
  'Tất cả',
  'TTDV-A',
  'Mobile',
]

export type SafetyCameraGroupKey = SafetyCameraZone | 'Mobile'

const GROUP_ORDER: SafetyCameraGroupKey[] = ['TTDV-A', 'Mobile']

export function filterSafetyCameras(tab: SafetyCameraFilterTab): TrainingCamera[] {
  switch (tab) {
    case 'Tất cả':
      return SAFETY_CAMERAS
    case 'TTDV-A':
      return SAFETY_CAMERAS.filter(c => c.streamType === 'fixed' && c.zone === 'TTDV-A')
    case 'Mobile':
      return SAFETY_CAMERAS.filter(c => c.streamType === 'mobile')
  }
}

export function groupSafetyCamerasForSidebar(
  cameras: TrainingCamera[],
  tab: SafetyCameraFilterTab,
): { key: SafetyCameraGroupKey; cameras: TrainingCamera[] }[] {
  if (tab !== 'Tất cả') {
    return cameras.length > 0 ? [{ key: tab as SafetyCameraGroupKey, cameras }] : []
  }

  const buckets: Record<SafetyCameraGroupKey, TrainingCamera[]> = {
    'TTDV-A': [],
    Mobile: [],
  }

  for (const cam of cameras) {
    if (cam.streamType === 'mobile') buckets.Mobile.push(cam)
    else if (cam.zone === 'TTDV-A') buckets['TTDV-A'].push(cam)
  }

  return GROUP_ORDER
    .filter(key => buckets[key].length > 0)
    .map(key => ({ key, cameras: buckets[key] }))
}

/** Thiết bị giám sát thực tế — Cam 03, Cam 04, Mobile Duncan */
export function computeSafetyDeviceKpis(): {
  deviceActiveCount: number
  deviceTotalCount: number
  cameraCount: number
  bodycamCount: number
  droneCount: number
  monitoredZones: number
  deviceBreakdown: {
    key: 'camera' | 'bodycam' | 'flycam'
    label: string
    active: number
    total: number
  }[]
} {
  const fixed = SAFETY_CAMERAS.filter(c => c.streamType === 'fixed')
  const mobile = SAFETY_CAMERAS.filter(c => c.streamType === 'mobile')
  const isOnline = (c: TrainingCamera) => c.status === 'online'

  const cameraActive = fixed.filter(isOnline).length
  const mobileActive = mobile.filter(isOnline).length
  const zones = new Set(SAFETY_CAMERAS.map(c => c.zone).filter(Boolean))

  const deviceBreakdown = [
    { key: 'camera' as const, label: 'Camera', active: cameraActive, total: fixed.length },
    { key: 'bodycam' as const, label: 'Mobile', active: mobileActive, total: mobile.length },
  ]

  return {
    monitoredZones: zones.size,
    deviceActiveCount: cameraActive + mobileActive,
    deviceTotalCount: fixed.length + mobile.length,
    cameraCount: cameraActive,
    bodycamCount: mobileActive,
    droneCount: 0,
    deviceBreakdown,
  }
}
