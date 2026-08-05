import {
  isInCam04SpecialSegment as isInCam04SpecialSegmentRuntime,
  isInPcccVideoSegment as isInPcccVideoSegmentRuntime,
  isPcccCamera as isPcccCameraRuntime,
} from '@/modules/module02-training/data/cameraAiRuntime'

/** Camera bật phân tích PCCC (hút thuốc / cháy nổ) — Cam A-04. */
export const PCCC_CAMERA_IDS = ['A-04'] as const

export type PcccCameraId = (typeof PCCC_CAMERA_IDS)[number]

export function isPcccCamera(cameraId: string): cameraId is PcccCameraId {
  return isPcccCameraRuntime(cameraId)
}

/** Đoạn PCCC trong ttdv-a-cam04-test.mp4 (5s sau đoạn PPE). */
export const PCCC_VIDEO_SEGMENT = { startSec: 14.95, endSec: 19.95 } as const

export function isInPcccVideoSegment(currentTimeSec: number): boolean {
  return isInPcccVideoSegmentRuntime(currentTimeSec)
}

/** Đoạn video Cam A-04 không chạy crane overlay. */
export function isInCam04SpecialSegment(currentTimeSec: number): boolean {
  return isInCam04SpecialSegmentRuntime(currentTimeSec)
}
