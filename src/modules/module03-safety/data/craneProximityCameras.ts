import { isCraneProximityCamera as isCraneProximityCameraRuntime } from '@/modules/module02-training/data/cameraAiRuntime'

/** Camera bật phân tích làm việc gần máy cẩu (Cam A-04). */
export const CRANE_PROXIMITY_CAMERA_IDS = ['A-04'] as const

export function isCraneProximityCamera(cameraId: string): boolean {
  return isCraneProximityCameraRuntime(cameraId)
}
