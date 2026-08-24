/** Patrol — đối tượng cần ≥1/3 thân trên (có đầu) trong khung. */

export type Bbox4 = [number, number, number, number]

function clipBoxToFrame(
  box: Bbox4,
  frameW: number,
  frameH: number,
): Bbox4 {
  const [x1, y1, x2, y2] = box
  return [
    Math.max(0, Math.min(frameW, x1)),
    Math.max(0, Math.min(frameH, y1)),
    Math.max(0, Math.min(frameW, x2)),
    Math.max(0, Math.min(frameH, y2)),
  ]
}

function zoneVisibleRatio(zone: Bbox4, frameW: number, frameH: number): number {
  const [, zy1, , zy2] = zone
  const rawH = Math.max(zy2 - zy1, 1)
  const [, cy1, , cy2] = clipBoxToFrame(zone, frameW, frameH)
  if (cy2 <= cy1) return 0
  return (cy2 - cy1) / rawH
}

export function patrolPersonMeetsUpperBodyGate(
  bbox: Bbox4,
  frameW: number,
  frameH: number,
  opts?: {
    upperFrac?: number
    headFrac?: number
    minVisible?: number
    minUpperPxFrac?: number
    minHeadPxFrac?: number
  },
): boolean {
  if (frameW <= 0 || frameH <= 0) return false
  const upperFrac = opts?.upperFrac ?? 0.50
  const headFrac = opts?.headFrac ?? 0.24
  const minVisible = opts?.minVisible ?? 0.33
  const minUpperPxFrac = opts?.minUpperPxFrac ?? 0.08
  const minHeadPxFrac = opts?.minHeadPxFrac ?? 0.04

  const [x1, y1, x2, y2] = bbox
  const ph = Math.max(y2 - y1, 1)
  const pw = Math.max(x2 - x1, 1)
  const head: Bbox4 = [x1 + pw * 0.10, y1, x2 - pw * 0.10, y1 + ph * headFrac]
  const upper: Bbox4 = [x1 + pw * 0.05, y1, x2 - pw * 0.05, y1 + ph * upperFrac]

  const headVis = zoneVisibleRatio(head, frameW, frameH)
  const upperVis = zoneVisibleRatio(upper, frameW, frameH)
  if (headVis < minVisible || upperVis < minVisible) return false

  const visibleUpperH = upperVis * ph * upperFrac
  const visibleHeadH = headVis * ph * headFrac
  if (visibleUpperH < frameH * minUpperPxFrac) return false
  if (visibleHeadH < frameH * minHeadPxFrac) return false

  const y1Ratio = y1 / frameH
  const bhRatio = ph / frameH
  if (y1Ratio > 0.62 && bhRatio < 0.18) return false

  return true
}
