/** Tiến độ vòng tròn quét mặt — gộp góc đã xong + giữ yên góc hiện tại. */
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
