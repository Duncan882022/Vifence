/** Camera bật phân tích làm việc gần máy cẩu (Cam A-04). */
export const CRANE_PROXIMITY_CAMERA_IDS = ['A-04'] as const

export function isCraneProximityCamera(cameraId: string): boolean {
  return (CRANE_PROXIMITY_CAMERA_IDS as readonly string[]).includes(cameraId)
}
