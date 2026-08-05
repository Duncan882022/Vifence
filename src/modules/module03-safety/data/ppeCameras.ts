/** Camera bật phân tích PPE (mũ / áo / giày) — Cam A-04. */
export const PPE_CAMERA_IDS = ['A-04'] as const

export type PpeCameraId = (typeof PPE_CAMERA_IDS)[number]

export function isPpeCamera(cameraId: string): cameraId is PpeCameraId {
  return (PPE_CAMERA_IDS as readonly string[]).includes(cameraId)
}

/** Đoạn PPE trong ttdv-a-cam04-test.mp4 (giây 10–15). */
export const PPE_VIDEO_SEGMENT = { startSec: 9.8, endSec: 14.95 } as const

export function isInPpeVideoSegment(currentTimeSec: number): boolean {
  return currentTimeSec >= PPE_VIDEO_SEGMENT.startSec && currentTimeSec < PPE_VIDEO_SEGMENT.endSec
}
