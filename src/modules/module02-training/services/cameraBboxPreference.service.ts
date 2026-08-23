import { shouldHidePatrolCameraRoi } from '@/modules/module05-productivity/utils/patrolPpeVisibility'

const STORAGE_KEY = 'vifence_camera_bbox_visible'

export const CAMERA_BBOX_PREFERENCE_CHANGED = 'vifence-camera-bbox-changed'

function readMap(): Record<string, boolean> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, boolean>
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeMap(map: Record<string, boolean>): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(map))
}

export function notifyCameraBboxPreferenceChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(CAMERA_BBOX_PREFERENCE_CHANGED))
}

/** Mặc định bật bbox; HC-* (Module 05 ẩn ROI) mặc định tắt. */
export function getCameraBboxVisible(cameraId: string): boolean {
  const map = readMap()
  if (!(cameraId in map)) {
    return shouldHidePatrolCameraRoi(cameraId) ? false : true
  }
  return map[cameraId] !== false
}

export function setCameraBboxVisible(cameraId: string, visible: boolean): void {
  const map = readMap()
  map[cameraId] = visible
  writeMap(map)
  notifyCameraBboxPreferenceChanged()
}

export function toggleCameraBboxVisible(cameraId: string): boolean {
  const next = !getCameraBboxVisible(cameraId)
  setCameraBboxVisible(cameraId, next)
  return next
}
