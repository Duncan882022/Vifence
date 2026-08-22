/**
 * HC-02 — live qua camera điện thoại (cùng luồng MOB-01 Module 03).
 * getUserMedia → POST /analyze/frame → backend AI → events + overlay.
 * Không dùng MP4 mock bodycam-02.
 */
export function isPatrolHelmetMobileStream(cameraId: string): boolean {
  return cameraId === 'HC-02'
}
