import { displayUnknown } from './displayUnknown'
import { formatRoiOverlayBadge } from './roiOverlayCode'

/** Nhãn bbox người — tên nếu nhận diện được, không thì Unknown. */
export function formatPersonOverlayBadge(
  workerName: string | null | undefined,
  confidence: number,
  suffix = '',
): string {
  return formatRoiOverlayBadge(displayUnknown(workerName), confidence, suffix)
}

export function formatPersonOverlayLabel(workerName: string | null | undefined): string {
  return displayUnknown(workerName)
}
