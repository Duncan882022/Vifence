/** Camera thuộc Module 05 — helmet tuần tra (HC-*). */
export const PATROL_HELMET_CAMERA_PREFIX = 'HC-'

export function isPatrolHelmetCameraId(cameraId: string): boolean {
  return cameraId.startsWith(PATROL_HELMET_CAMERA_PREFIX)
}

export function assertPatrolHelmetCameraId(cameraId: string): void {
  if (!isPatrolHelmetCameraId(cameraId)) {
    throw new Error(`Camera ${cameraId} không thuộc Module 05 (HC-*)`)
  }
}
