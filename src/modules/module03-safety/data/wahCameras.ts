import {
  isInWahVideoSegment as isInWahVideoSegmentRuntime,
  isWahCamera as isWahCameraRuntime,
} from '@/modules/module02-training/data/cameraAiRuntime'

/** Camera bật phân tích WAH — Cam A-04. */
export const WAH_CAMERA_IDS = ['A-04'] as const

export type WahCameraId = (typeof WAH_CAMERA_IDS)[number]

export function isWahCamera(cameraId: string): cameraId is WahCameraId {
  return isWahCameraRuntime(cameraId)
}

/** Đoạn WAH trong ttdv-a-cam04-test.mp4 (5s sau đoạn PCCC). */
export const WAH_VIDEO_SEGMENT = { startSec: 19.95, endSec: 24.95 } as const

export function isInWahVideoSegment(currentTimeSec: number): boolean {
  return isInWahVideoSegmentRuntime(currentTimeSec)
}
