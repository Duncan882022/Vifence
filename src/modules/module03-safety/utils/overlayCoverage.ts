import { OVERLAY_MIN_CONFIDENCE } from './overlayVisibility'

export type OverlayBbox = [number, number, number, number]

/** Ngưỡng vùng kỳ vọng được detection phủ — bbox phải ôm đối tượng, không “tràn” ROI. */
export const OVERLAY_MIN_COVERAGE = 0.78

function bboxArea(bbox: OverlayBbox): number {
  const w = Math.max(0, bbox[2] - bbox[0])
  const h = Math.max(0, bbox[3] - bbox[1])
  return w * h
}

function intersectionArea(a: OverlayBbox, b: OverlayBbox): number {
  const ix1 = Math.max(a[0], b[0])
  const iy1 = Math.max(a[1], b[1])
  const ix2 = Math.min(a[2], b[2])
  const iy2 = Math.min(a[3], b[3])
  if (ix2 <= ix1 || iy2 <= iy1) return 0
  return (ix2 - ix1) * (iy2 - iy1)
}

/** Phần trăm vùng kỳ vọng được detection phủ — dùng tránh vẽ ROI “fix sẵn”. */
export function coverageOfExpected(actual: OverlayBbox, expected: OverlayBbox): number {
  const expectedArea = bboxArea(expected)
  if (expectedArea <= 0) return 0
  return intersectionArea(actual, expected) / expectedArea
}

export function passesOverlayCoverage(
  actual: OverlayBbox,
  expected: OverlayBbox,
  minCoverage = OVERLAY_MIN_COVERAGE,
): boolean {
  return coverageOfExpected(actual, expected) >= minCoverage
}

export function passesOverlayConfidence(
  confidence: number,
  minConfidence = OVERLAY_MIN_CONFIDENCE,
): boolean {
  return confidence >= minConfidence
}

/** Detection đủ conf + (tuỳ chọn) phủ đúng vùng kỳ vọng. */
export function shouldShowOverlayBox(
  confidence: number,
  bbox: OverlayBbox,
  expectedBbox?: OverlayBbox,
): boolean {
  if (!passesOverlayConfidence(confidence)) return false
  if (!expectedBbox) return true
  return passesOverlayCoverage(bbox, expectedBbox)
}
