/** SVG vòng tròn tiến độ — tương thích mọi browser, không dùng CSS mask. */
export function faceScanRingDash(progress: number, radius: number): string {
  const p = Math.max(0, Math.min(1, progress))
  const circumference = 2 * Math.PI * radius
  const filled = circumference * p
  return `${filled} ${circumference}`
}

export function computeFaceScanRingProgress(
  capturedCount: number,
  required: number,
  holdProgress: number,
  complete: boolean,
): number {
  if (complete || required <= 0) return 1
  const safeHold = Math.max(0, Math.min(1, holdProgress))
  const safeCaptured = Math.max(0, capturedCount)
  return Math.min(1, (safeCaptured + safeHold) / required)
}

export const FACE_SCAN_MODEL_LOAD_TIMEOUT_MS = 8000
/** Giữ yên trong khung rồi tự chụp — eKYC fallback (backend xác thực mặt). */
export const FACE_SCAN_HOLD_CAPTURE_MS = 1000
/** Khi BlazeFace thấy mặt — chụp nhanh hơn (Face ID feel). */
export const FACE_SCAN_AI_HOLD_MS = 550
/** Số tick liên tiếp lệch góc trước khi reset hold — tránh giật. */
export const FACE_SCAN_HOLD_MISMATCH_TICKS = 3
