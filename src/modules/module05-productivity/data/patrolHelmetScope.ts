/** Camera thuộc Module 05 — helmet tuần tra (HC-*). */
export const PATROL_HELMET_CAMERA_PREFIX = 'HC-'

export function isPatrolHelmetCameraId(cameraId: string): boolean {
  return cameraId.startsWith(PATROL_HELMET_CAMERA_PREFIX)
}

/** HC-* hoặc DR-* — poll metrics / stream online trên lưới Module 05. */
export function isPatrolMetricsCameraId(cameraId: string): boolean {
  return isPatrolHelmetCameraId(cameraId) || cameraId.startsWith('DR-')
}

/**
 * ROI live trên tile camera — tắt mặc định.
 * BE xử lý trước → bbox HTTP đuổi theo video gây hiểu nhầm.
 * Bật lại khi có buffer sync `PATROL_LIVE_ROI_DELAY_MS`.
 */
export const PATROL_LIVE_ROI_ENABLED = false
/** Phase 2 — playback + detection cùng timeline (ms). */
export const PATROL_LIVE_ROI_DELAY_MS = 5000

/** Camera vẽ ROI người tuần tra (bodycam + flycam). */
export function isPatrolPersonRoiCameraId(cameraId: string): boolean {
  return PATROL_LIVE_ROI_ENABLED && isPatrolMetricsCameraId(cameraId)
}

/**
 * Camera tuần tra chỉ theo dõi người — không có PPE.
 *
 * Backend không chạy model PPE nào cho bodycam và flycam, nên đây là ràng buộc
 * phạm vi của Module 05 chứ không phải công tắc bật/tắt tính năng. Overlay ATLĐ
 * dùng hàm này để không vẽ bbox vi phạm lên tile tuần tra.
 */
export function isPatrolPersonOnlyCamera(cameraId: string): boolean {
  return isPatrolMetricsCameraId(cameraId)
}

/**
 * Backend còn relay HLS cho camera này không.
 *
 * Phải khớp `VMS_HLS_RELAY_SKIP_PREFIXES` phía backend: camera tuần tra được
 * CMS xem thẳng qua MediaMTX nên worker không encode lại, `/stream/<cam>/`
 * trả 503. Coi đó là nguồn dự phòng chỉ tổ làm tile gắn lại luồng liên tục.
 */
export function isVmsHlsRelayEnabled(cameraId: string): boolean {
  return !isPatrolMetricsCameraId(cameraId)
}

export function assertPatrolHelmetCameraId(cameraId: string): void {
  if (!isPatrolHelmetCameraId(cameraId)) {
    throw new Error(`Camera ${cameraId} không thuộc Module 05 (HC-*)`)
  }
}
