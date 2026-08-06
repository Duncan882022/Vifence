/** Logic phân làn ATGT — vi phạm khi trong polygon không detect được làn (cứng hoặc mềm). */

export const ATGT_LANE_MIN_CONF = 0

export type AtgtLaneBehavior = 'hard_median' | 'soft_median' | 'no_soft_median'

export function isAtgtLaneMedianBehavior(behavior: string): boolean {
  return behavior === 'hard_median' || behavior === 'soft_median'
}

export function isAtgtLaneViolationBehavior(behavior: string): boolean {
  return behavior === 'no_soft_median'
}

export function hasAtgtLaneMedian(
  detections: Array<{ behavior: string; confidence?: number }>,
  minConf = ATGT_LANE_MIN_CONF,
): boolean {
  return detections.some(
    d => isAtgtLaneMedianBehavior(d.behavior) && (d.confidence ?? 1) >= minConf,
  )
}

export function filterAtgtLaneOverlayDetections<T extends { behavior: string; confidence: number }>(
  detections: T[],
): T[] {
  const lanePresent = hasAtgtLaneMedian(detections)
  return detections.filter(d => {
    if (isAtgtLaneViolationBehavior(d.behavior)) {
      return !lanePresent && d.confidence >= ATGT_LANE_MIN_CONF
    }
    if (isAtgtLaneMedianBehavior(d.behavior)) {
      return lanePresent && d.confidence >= ATGT_LANE_MIN_CONF
    }
    return true
  })
}
