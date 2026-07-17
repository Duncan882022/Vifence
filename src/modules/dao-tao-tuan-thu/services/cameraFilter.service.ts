import type { CameraWithWorker } from '../hooks/useCameras'

export const CAMERA_LOCATION_ALL = 'Tất cả'

export function getCameraLocationTabs(cameras: CameraWithWorker[]): string[] {
  const addresses = [
    ...new Set(
      cameras
        .map(cam => cam.address?.trim())
        .filter((address): address is string => !!address && address !== 'N/A'),
    ),
  ].sort((a, b) => a.localeCompare(b, 'vi'))

  return [CAMERA_LOCATION_ALL, ...addresses]
}

export function filterCamerasByLocation(
  cameras: CameraWithWorker[],
  tab: string,
): CameraWithWorker[] {
  if (tab === CAMERA_LOCATION_ALL) return cameras
  return cameras.filter(cam => cam.address?.trim() === tab)
}

export function groupCamerasByLocation(
  cameras: CameraWithWorker[],
  tab: string,
): { key: string; cameras: CameraWithWorker[] }[] {
  const filtered = filterCamerasByLocation(cameras, tab)

  if (tab !== CAMERA_LOCATION_ALL) {
    return filtered.length > 0 ? [{ key: tab, cameras: filtered }] : []
  }

  const buckets = new Map<string, CameraWithWorker[]>()
  for (const cam of filtered) {
    const key = cam.address?.trim() || 'Khác'
    const list = buckets.get(key) ?? []
    list.push(cam)
    buckets.set(key, list)
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'vi'))
    .map(([key, groupCameras]) => ({ key, cameras: groupCameras }))
}
