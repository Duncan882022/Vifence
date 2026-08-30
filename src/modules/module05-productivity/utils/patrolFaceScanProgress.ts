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
