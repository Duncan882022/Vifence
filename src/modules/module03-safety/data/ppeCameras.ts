import {
  isInPpeVideoSegment as isInPpeVideoSegmentRuntime,
  isPpeCamera as isPpeCameraRuntime,
} from '@/modules/module02-training/data/cameraAiRuntime'

/** Camera bật phân tích PPE (mũ / áo / giày) — Cam A-04. */
export const PPE_CAMERA_IDS = ['A-04'] as const

export type PpeCameraId = (typeof PPE_CAMERA_IDS)[number]

export function isPpeCamera(cameraId: string): cameraId is PpeCameraId {
  return isPpeCameraRuntime(cameraId)
}

/** Đoạn PPE trong ttdv-a-cam04-test.mp4 — cả đoạn có người (trước WAH). */
export const PPE_VIDEO_SEGMENT = { startSec: 0, endSec: 19.95 } as const

export function isInPpeVideoSegment(currentTimeSec: number): boolean {
  return isInPpeVideoSegmentRuntime(currentTimeSec)
}
