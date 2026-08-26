/** Camera thuộc Module 05 — helmet tuần tra (HC-*). */
export const PATROL_HELMET_CAMERA_PREFIX = 'HC-'

export function isPatrolHelmetCameraId(cameraId: string): boolean {
  return cameraId.startsWith(PATROL_HELMET_CAMERA_PREFIX)
}

/** HC-* hoặc DR-* — poll metrics / stream online trên lưới Module 05. */
export function isPatrolMetricsCameraId(cameraId: string): boolean {
  return isPatrolHelmetCameraId(cameraId) || cameraId.startsWith('DR-')
}

/** Camera vẽ ROI người tuần tra (bodycam + flycam). */
export function isPatrolPersonRoiCameraId(cameraId: string): boolean {
  return isPatrolMetricsCameraId(cameraId)
}

export function assertPatrolHelmetCameraId(cameraId: string): void {
  if (!isPatrolHelmetCameraId(cameraId)) {
    throw new Error(`Camera ${cameraId} không thuộc Module 05 (HC-*)`)
  }
}
