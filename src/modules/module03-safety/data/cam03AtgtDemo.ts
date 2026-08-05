/** Demo ATGT Cam A-03 — toạ độ chuẩn hoá 0–1 trên khung 640×640. */
import {
  hasAtgtLaneMedian,
  isCam03AtgtOpeningFrame,
} from '../utils/atgtLaneLogic'
import { formatVehicleOverlayLabel } from '../utils/vehiclePlate'

export const CAM03_ATGT_DEMO_VEHICLE = {
  id: 'vehicle-1',
  x1: 382 / 640,
  y1: 345 / 640,
  x2: 528 / 640,
  y2: 458 / 640,
} as const

export const CAM03_ATGT_DEMO_HARD_MEDIAN = {
  x1: 12 / 640,
  y1: 408 / 640,
  x2: 325 / 640,
  y2: 1,
} as const

export const CAM03_ATGT_VIDEO_SEGMENT = { startSec: 10.05, endSec: 15.05 } as const

export function isInCam03AtgtDemoSegment(currentTimeSec: number): boolean {
  return currentTimeSec >= CAM03_ATGT_VIDEO_SEGMENT.startSec
    && currentTimeSec < CAM03_ATGT_VIDEO_SEGMENT.endSec
}

export type AtgtDemoBehavior =
  | 'vehicle'
  | 'speeding'
  | 'hard_median'
  | 'soft_median'
  | 'no_soft_median'

export function cam03AtgtDemoDetections(
  frameWidth: number,
  frameHeight: number,
  currentTimeSec?: number,
): Array<{
  behavior: AtgtDemoBehavior
  label: string
  confidence: number
  bbox: [number, number, number, number]
  vehiclePlate?: string
  vehicleType?: string
}> {
  const vehicleBbox: [number, number, number, number] = [
    CAM03_ATGT_DEMO_VEHICLE.x1 * frameWidth,
    CAM03_ATGT_DEMO_VEHICLE.y1 * frameHeight,
    CAM03_ATGT_DEMO_VEHICLE.x2 * frameWidth,
    CAM03_ATGT_DEMO_VEHICLE.y2 * frameHeight,
  ]
  const hardMedianBbox: [number, number, number, number] = [
    CAM03_ATGT_DEMO_HARD_MEDIAN.x1 * frameWidth,
    CAM03_ATGT_DEMO_HARD_MEDIAN.y1 * frameHeight,
    CAM03_ATGT_DEMO_HARD_MEDIAN.x2 * frameWidth,
    CAM03_ATGT_DEMO_HARD_MEDIAN.y2 * frameHeight,
  ]
  const openingFrame = currentTimeSec != null
    && isCam03AtgtOpeningFrame(currentTimeSec, CAM03_ATGT_VIDEO_SEGMENT.startSec)

  const out: Array<{
    behavior: AtgtDemoBehavior
    label: string
    confidence: number
    bbox: [number, number, number, number]
    vehiclePlate?: string
    vehicleType?: string
  }> = [
    {
      behavior: 'vehicle',
      label: formatVehicleOverlayLabel(undefined),
      confidence: 0.93,
      bbox: vehicleBbox,
    },
    {
      behavior: 'speeding',
      label: 'Phương tiện vượt quá tốc độ quy định',
      confidence: 0.91,
      bbox: vehicleBbox,
    },
  ]

  // Frame đầu đoạn ATGT: chưa thấy làn → sẽ log vi phạm. Các frame sau: thấy làn cứng → OK.
  if (!openingFrame) {
    out.push({
      behavior: 'hard_median',
      label: 'Làn phân cách cứng',
      confidence: 0.88,
      bbox: hardMedianBbox,
    })
  }

  if (!hasAtgtLaneMedian(out)) {
    out.push({
      behavior: 'no_soft_median',
      label: 'Không tổ chức phân làn, luồng giao thông',
      confidence: 0.86,
      bbox: hardMedianBbox,
    })
  }

  return out
}
