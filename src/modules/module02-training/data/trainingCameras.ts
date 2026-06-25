import type { Camera } from '@/types/camera'
import { getCourseZone } from './trainingCourseMeta'
import { getStreamUrlForCamera } from './trainingCameraFeeds'

export type CameraStreamType = 'fixed' | 'bodycam' | 'flycam'

export type CameraFilterTab = 'Tất cả' | 'OCP1-A' | 'OCP1-B' | 'Body cam' | 'Flycam'

export interface TrainingCamera extends Camera {
  streamType: CameraStreamType
  /** Chỉ CCTV cố định — phòng lắp cam gắn khoá học */
  courseName?: string
  /** Người mang body cam — không gắn khoá cố định */
  assignee?: string
}

const RAW_CAMERAS: Omit<TrainingCamera, 'streamUrl'>[] = [
  /* ── OCP1-A — CCTV cố định ─────────────────────────────── */
  { id: 'A-01', name: 'Cam 01', location: 'Cổng vào',         zone: 'OCP1-A', status: 'online', streamType: 'fixed' },
  { id: 'A-02', name: 'Cam 02', location: 'Phòng Đào Tạo A1', zone: 'OCP1-A', status: 'online', streamType: 'fixed', courseName: 'Toolbox A' },
  { id: 'A-03', name: 'Cam 03', location: 'Phòng Đào Tạo A2', zone: 'OCP1-A', status: 'online', streamType: 'fixed', courseName: 'Cọc nhồi B' },
  { id: 'A-04', name: 'Cam 04', location: 'Sân Tập A',         zone: 'OCP1-A', status: 'online', streamType: 'fixed' },
  { id: 'A-05', name: 'Cam 05', location: 'Hành Lang',         zone: 'OCP1-A', status: 'online', streamType: 'fixed' },
  { id: 'A-06', name: 'Cam 06', location: 'Kho Vật Tư',        zone: 'OCP1-A', status: 'online', streamType: 'fixed' },
  { id: 'A-07', name: 'Cam 07', location: 'Bãi Đỗ Xe',         zone: 'OCP1-A', status: 'online', streamType: 'fixed' },
  { id: 'A-08', name: 'Cam 08', location: 'Phòng Giải Lao',    zone: 'OCP1-A', status: 'online', streamType: 'fixed' },
  /* ── OCP1-B — CCTV cố định ─────────────────────────────── */
  { id: 'B-01', name: 'Cam 01', location: 'Cổng vào',          zone: 'OCP1-B', status: 'online', streamType: 'fixed' },
  { id: 'B-02', name: 'Cam 02', location: 'Sân Thực Hành B1',  zone: 'OCP1-B', status: 'online', streamType: 'fixed', courseName: 'PCCC C' },
  { id: 'B-03', name: 'Cam 03', location: 'Phòng Đào Tạo B2',  zone: 'OCP1-B', status: 'online', streamType: 'fixed', courseName: 'Điện cơ E' },
  { id: 'B-04', name: 'Cam 04', location: 'Phòng họp B',        zone: 'OCP1-B', status: 'online', streamType: 'fixed' },
  { id: 'B-05', name: 'Cam 05', location: 'Hành Lang',          zone: 'OCP1-B', status: 'online', streamType: 'fixed' },
  { id: 'B-06', name: 'Cam 06', location: 'Khu Vực Máy Móc',   zone: 'OCP1-B', status: 'online', streamType: 'fixed' },
  { id: 'B-07', name: 'Cam 07', location: 'Bãi Tập Kết',        zone: 'OCP1-B', status: 'online', streamType: 'fixed' },
  { id: 'B-08', name: 'Cam 08', location: 'Phòng Y Tế',         zone: 'OCP1-B', status: 'online', streamType: 'fixed' },
  /* ── Body cam ───────────────────────────────────────────── */
  { id: 'BC-01', name: 'Body 01', location: 'Di động', zone: '', status: 'online', streamType: 'bodycam', assignee: 'Phạm Văn Cường' },
  { id: 'BC-02', name: 'Body 02', location: 'Di động', zone: '', status: 'online', streamType: 'bodycam', assignee: 'Trần Văn Bình' },
  { id: 'BC-03', name: 'Body 03', location: 'Di động', zone: '', status: 'online', streamType: 'bodycam', assignee: 'Lê Thị Hoa' },
  /* ── Flycam ─────────────────────────────────────────────── */
  { id: 'FC-01', name: 'Fly 01', location: 'Toàn cảnh',         zone: '', status: 'online', streamType: 'flycam' },
  { id: 'FC-02', name: 'Fly 02', location: 'Toàn cảnh',         zone: '', status: 'online', streamType: 'flycam' },
]

export const DEFAULT_COURSE_CAMERA_IDS = ['A-02', 'A-03'] as const

export const CAMERA_FILTER_TABS: CameraFilterTab[] = [
  'Tất cả', 'OCP1-A', 'OCP1-B', 'Body cam', 'Flycam',
]

export const MOCK_TRAINING_CAMERAS: TrainingCamera[] = RAW_CAMERAS.map(cam => ({
  ...cam,
  streamUrl: getStreamUrlForCamera(cam.id),
}))

export function filterCameras(tab: CameraFilterTab): TrainingCamera[] {
  switch (tab) {
    case 'Tất cả':
      return MOCK_TRAINING_CAMERAS
    case 'OCP1-A':
      return MOCK_TRAINING_CAMERAS.filter(c => c.streamType === 'fixed' && c.zone === 'OCP1-A')
    case 'OCP1-B':
      return MOCK_TRAINING_CAMERAS.filter(c => c.streamType === 'fixed' && c.zone === 'OCP1-B')
    case 'Body cam':
      return MOCK_TRAINING_CAMERAS.filter(c => c.streamType === 'bodycam')
    case 'Flycam':
      return MOCK_TRAINING_CAMERAS.filter(c => c.streamType === 'flycam')
  }
}

export type CameraGroupKey = 'OCP1-A' | 'OCP1-B' | 'Body cam' | 'Flycam'

const GROUP_ORDER: CameraGroupKey[] = ['OCP1-A', 'OCP1-B', 'Body cam', 'Flycam']

export function groupCamerasForSidebar(
  cameras: TrainingCamera[],
  tab: CameraFilterTab,
): { key: CameraGroupKey; cameras: TrainingCamera[] }[] {
  if (tab === 'OCP1-A' || tab === 'OCP1-B' || tab === 'Body cam' || tab === 'Flycam') {
    return cameras.length > 0 ? [{ key: tab as CameraGroupKey, cameras }] : []
  }

  const buckets: Record<CameraGroupKey, TrainingCamera[]> = {
    'OCP1-A': [],
    'OCP1-B': [],
    'Body cam': [],
    Flycam: [],
  }

  for (const cam of cameras) {
    if (cam.streamType === 'bodycam') buckets['Body cam'].push(cam)
    else if (cam.streamType === 'flycam') buckets.Flycam.push(cam)
    else if (cam.zone === 'OCP1-A') buckets['OCP1-A'].push(cam)
    else if (cam.zone === 'OCP1-B') buckets['OCP1-B'].push(cam)
  }

  return GROUP_ORDER
    .filter(key => buckets[key].length > 0)
    .map(key => ({ key, cameras: buckets[key] }))
}

export function isDefaultCourseCamera(id: string): boolean {
  return (DEFAULT_COURSE_CAMERA_IDS as readonly string[]).includes(id)
}

export function getCourseRoomCamera(courseName: string, zone?: string): TrainingCamera | undefined {
  const byCourse = MOCK_TRAINING_CAMERAS.find(
    c => c.streamType === 'fixed' && c.courseName === courseName,
  )
  if (byCourse) return byCourse
  const resolvedZone = zone ?? getCourseZone(courseName)
  return MOCK_TRAINING_CAMERAS.find(
    c => c.streamType === 'fixed' && c.zone === resolvedZone,
  )
}

export function cameraDisplayLabel(cam: TrainingCamera): string {
  if (cam.streamType === 'bodycam') return cam.assignee ?? cam.name
  if (cam.streamType === 'flycam') return cam.name
  return `${cam.zone} · ${cam.name}`
}

/** Dòng phụ trên tile — chỉ fixed CCTV mới hiện khoá học. */
export function cameraMetaLabel(cam: TrainingCamera): string | undefined {
  if (cam.streamType === 'bodycam') return cam.location
  if (cam.streamType === 'flycam') return cam.location
  if (cam.streamType === 'fixed' && cam.courseName) return cam.courseName
  return undefined
}

export function streamTypeBadge(cam: TrainingCamera): string | null {
  if (cam.streamType === 'bodycam') return 'BODY'
  if (cam.streamType === 'flycam') return 'FLY'
  return null
}
