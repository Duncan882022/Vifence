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
 * Buffer đồng bộ ROI live với video HLS (~5s trễ).
 * Áp dụng mọi camera tuần tra: HC-01, HC-02, DR-* — cho backend/AI kịp xử lý,
 * bbox/ROI bám khung đang phát thay vì snapshot mới nhất.
 * Bật/tắt hiển thị ROI: nút bbox trên toolbar (`getCameraBboxVisible`).
 */
export const PATROL_LIVE_ROI_DELAY_MS = 5000

/**
 * WebRTC WHEP ~200–500ms — không có EXT-X-PROGRAM-DATE-TIME như HLS.
 * Gửi `at_ms ≈ now − lag` để backend chọn overlay aligned (live HC-01: drift ~180ms).
 */
export const WHEP_DISPLAY_WALLCLOCK_LAG_MS = 400

/** Camera vẽ ROI người tuần tra (bodycam + flycam) — khi bbox toggle bật. */
export function isPatrolPersonRoiCameraId(cameraId: string): boolean {
  return isPatrolMetricsCameraId(cameraId)
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
