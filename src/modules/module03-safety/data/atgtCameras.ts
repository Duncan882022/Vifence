import {
  isAtgtCamera as isAtgtCameraRuntime,
  isInAtgtVideoSegment as isInAtgtVideoSegmentRuntime,
} from '@/modules/module02-training/data/cameraAiRuntime'

/** Camera bật phân tích ATGT — Cam A-03. */
export const ATGT_CAMERA_IDS = ['A-03'] as const

export type AtgtCameraId = (typeof ATGT_CAMERA_IDS)[number]

export function isAtgtCamera(cameraId: string): cameraId is AtgtCameraId {
  return isAtgtCameraRuntime(cameraId)
}

/** Đoạn ATGT trong ttdv-a-cam03-test.mp4 — không làn (0–10.5s) + xe + hàng rào (10.5–15s). */
export const ATGT_VIDEO_SEGMENT = { startSec: 0, endSec: 15.05 } as const

export function isInAtgtVideoSegment(currentTimeSec: number): boolean {
  return isInAtgtVideoSegmentRuntime(currentTimeSec)
}
