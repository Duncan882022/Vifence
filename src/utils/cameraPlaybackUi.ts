import dayjs from 'dayjs'
import type { TrainingCamera } from '@/modules/module02-training/data/trainingCameras'
import type { CameraPlaybackRecord } from '@/types/cameraPlayback'

const CONTINUOUS_TYPES = new Set(['continuous', 'continuous_event'])

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

/** Bản ghi thực tế dùng cho `<video>` — clip sự kiện lệch giây hay 404, ưu tiên băng liên tục. */
export function resolvePlaybackTarget(
  selected: CameraPlaybackRecord | null,
  records: CameraPlaybackRecord[],
): CameraPlaybackRecord | null {
  if (!selected) return null
  if (CONTINUOUS_TYPES.has(selected.type)) return selected

  const instant = dayjs(selected.startTime)
  if (!instant.isValid()) return selected

  const segments = records.filter(r => CONTINUOUS_TYPES.has(r.type))
  if (segments.length === 0) return selected

  for (const seg of segments) {
    const start = dayjs(seg.startTime)
    const end = dayjs(seg.endTime)
    if (!instant.isBefore(start) && !instant.isAfter(end)) {
      return {
        ...seg,
        seekSec: Math.max(0, instant.diff(start, 'second')),
      }
    }
  }

  let nearest: CameraPlaybackRecord | null = null
  let nearestDeltaSec = Number.POSITIVE_INFINITY
  for (const seg of segments) {
    const start = dayjs(seg.startTime)
    const deltaSec = Math.abs(instant.diff(start, 'second'))
    if (deltaSec < nearestDeltaSec) {
      nearestDeltaSec = deltaSec
      nearest = seg
    }
  }

  if (nearest && nearestDeltaSec <= 5 * 60) {
    const start = dayjs(nearest.startTime)
    const segDurationSec = Math.max(1, dayjs(nearest.endTime).diff(start, 'second'))
    const seekSec = Math.min(
      Math.max(0, instant.diff(start, 'second')),
      segDurationSec - 1,
    )
    return { ...nearest, seekSec }
  }

  return selected
}

export function formatPlaybackClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
