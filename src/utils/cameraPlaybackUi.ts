import type { TrainingCamera } from '@/modules/module02-training/data/trainingCameras'
import type { CameraPlaybackRecord } from '@/types/cameraPlayback'

export const ALL_LOCATIONS_TAB = 'Tất cả'

export function getCameraLocation(cam: TrainingCamera): string {
  return cam.location?.trim() || cam.zone?.trim() || 'Khác'
}

export function getLocationFilterTabs(cameras: TrainingCamera[]): string[] {
  const locations = [
    ...new Set(cameras.map(getCameraLocation).filter(loc => loc && loc !== 'N/A')),
  ].sort((a, b) => a.localeCompare(b, 'vi'))
  return [ALL_LOCATIONS_TAB, ...locations]
}

export function filterCamerasByLocation(
  cameras: TrainingCamera[],
  tab: string,
): TrainingCamera[] {
  if (tab === ALL_LOCATIONS_TAB) return cameras
  return cameras.filter(cam => getCameraLocation(cam) === tab)
}

export function groupCamerasByLocation(
  cameras: TrainingCamera[],
  tab: string,
): { key: string; cameras: TrainingCamera[] }[] {
  const filtered = filterCamerasByLocation(cameras, tab)
  if (tab !== ALL_LOCATIONS_TAB) {
    return filtered.length > 0 ? [{ key: tab, cameras: filtered }] : []
  }

  const buckets = new Map<string, TrainingCamera[]>()
  for (const cam of filtered) {
    const key = getCameraLocation(cam)
    const list = buckets.get(key) ?? []
    list.push(cam)
    buckets.set(key, list)
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'vi'))
    .map(([key, cams]) => ({ key, cameras: cams }))
}

export function resolvePlaybackVideoUrl(record: CameraPlaybackRecord | null): string | null {
  if (!record) return null
  if (record.videoUrl) return record.videoUrl
  if (record.videoId) {
    const base = import.meta.env.BASE_URL.replace(/\/?$/, '/')
    return `${base}ai-data/${record.videoId}`
  }
  return null
}

export function formatPlaybackClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
