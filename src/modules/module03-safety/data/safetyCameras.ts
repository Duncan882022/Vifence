import type { TrainingCamera } from '@/modules/module02-training/data/trainingCameras'
import { MOCK_TRAINING_CAMERAS } from '@/modules/module02-training/data/trainingCameras'

/** Zone camera công trường Giảng Võ — Module 03 ATLĐ */
export type SafetyCameraZone = 'TTDV-A' | 'TMDV-B' | 'TMDV-C'

export type SafetyCameraFilterTab =
  | 'Tất cả'
  | SafetyCameraZone
  | 'Body cam'
  | 'Flycam'
  | 'Mobile'

/**
 * Camera Mobile — luồng trực tiếp từ camera thiết bị (getUserMedia), không dùng
 * clip mock. MOB-01 ưu tiên thiết bị iPhone/Continuity; MOB-02 ưu tiên iMac/
 * FaceTime HD.
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
  {
    id: 'MOB-02',
    name: 'Duncan Imac',
    location: 'Di động — Hiện trường',
    zone: '',
    status: 'online',
    streamType: 'mobile',
    assignee: 'Duncan Imac',
  },
]

interface SafetyCameraOverride {
  zone: SafetyCameraZone
  location: string
}

/** Map id camera Module 02 → zone + vị trí hiện trường Giảng Võ */
const GIANG_VO_FIXED: Record<string, SafetyCameraOverride> = {
  'A-01': { zone: 'TTDV-A', location: 'Block phía Bắc — Cổng' },
  'A-02': { zone: 'TTDV-A', location: 'Block phía Bắc — Sàn thi công' },
  'A-03': { zone: 'TTDV-A', location: 'Block T.Bắc — Mép biên' },
  'A-04': { zone: 'TTDV-A', location: 'Block T.Bắc — Lồng thang' },
  'A-05': { zone: 'TTDV-A', location: 'Đường nội bộ — Hướng Bắc' },
  'A-06': { zone: 'TTDV-A', location: 'Đường nội bộ — Giữa block' },
  'A-07': { zone: 'TTDV-A', location: 'Nút Tây — Phân làn' },
  'A-08': { zone: 'TTDV-A', location: 'Nút Tây — Cổng phụ' },
  'B-01': { zone: 'TMDV-B', location: 'Block phía Nam — Cổng' },
  'B-02': { zone: 'TMDV-B', location: 'Block phía Nam — Sàn cao' },
  'B-03': { zone: 'TMDV-B', location: 'Block Nam — Kho vật tư' },
  'B-04': { zone: 'TMDV-B', location: 'Block Nam — Hành lang' },
  'B-05': { zone: 'TMDV-C', location: 'Nút Đông — Phân làn' },
  'B-06': { zone: 'TMDV-C', location: 'Nút Đông — Bãi tập kết' },
  'B-07': { zone: 'TMDV-C', location: 'Khu máy móc' },
  'B-08': { zone: 'TMDV-C', location: 'Khu PCCC / CV nóng' },
}

/** Camera mặc định hiển thị khi mở Module 03 — Cam 03 + Duncan IPhone (bỏ Cam 06) */
export const DEFAULT_SAFETY_CAMERA_IDS = ['A-03', 'MOB-01'] as const

/** Camera live Module 03 — reuse feed Module 02, đổi zone/location → Giảng Võ, + Mobile riêng */
export const SAFETY_CAMERAS: TrainingCamera[] = [
  ...MOCK_TRAINING_CAMERAS.map(cam => {
    if (cam.streamType !== 'fixed') {
      return {
        ...cam,
        courseName: undefined,
      }
    }
    const ov = GIANG_VO_FIXED[cam.id]
    if (!ov) return { ...cam, courseName: undefined }
    return {
      ...cam,
      zone: ov.zone,
      location: ov.location,
      courseName: undefined,
    }
  }),
  ...MOBILE_CAMERAS,
]

export const SAFETY_CAMERA_FILTER_TABS: SafetyCameraFilterTab[] = [
  'Tất cả', 'TTDV-A', 'TMDV-B', 'TMDV-C', 'Body cam', 'Flycam', 'Mobile',
]

export type SafetyCameraGroupKey = SafetyCameraZone | 'Body cam' | 'Flycam' | 'Mobile'

const GROUP_ORDER: SafetyCameraGroupKey[] = ['TTDV-A', 'TMDV-B', 'TMDV-C', 'Body cam', 'Flycam', 'Mobile']

export function filterSafetyCameras(tab: SafetyCameraFilterTab): TrainingCamera[] {
  switch (tab) {
    case 'Tất cả':
      return SAFETY_CAMERAS
    case 'TTDV-A':
    case 'TMDV-B':
    case 'TMDV-C':
      return SAFETY_CAMERAS.filter(c => c.streamType === 'fixed' && c.zone === tab)
    case 'Body cam':
      return SAFETY_CAMERAS.filter(c => c.streamType === 'bodycam')
    case 'Flycam':
      return SAFETY_CAMERAS.filter(c => c.streamType === 'flycam')
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
    'TMDV-B': [],
    'TMDV-C': [],
    'Body cam': [],
    Flycam: [],
    Mobile: [],
  }

  for (const cam of cameras) {
    if (cam.streamType === 'bodycam') buckets['Body cam'].push(cam)
    else if (cam.streamType === 'flycam') buckets.Flycam.push(cam)
    else if (cam.streamType === 'mobile') buckets.Mobile.push(cam)
    else if (cam.zone === 'TTDV-A' || cam.zone === 'TMDV-B' || cam.zone === 'TMDV-C') {
      buckets[cam.zone].push(cam)
    }
  }

  return GROUP_ORDER
    .filter(key => buckets[key].length > 0)
    .map(key => ({ key, cameras: buckets[key] }))
}
