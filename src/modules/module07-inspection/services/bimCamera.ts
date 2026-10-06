/** Distance so a bounding sphere of `radius` fits in a perspective camera. */
export function fitDistance(radius: number, fovDeg: number, aspect: number, pad = 1.28): number {
  const safe = Math.max(radius, 0.8)
  const half = (fovDeg * Math.PI / 180) / 2
  const vertical = safe / Math.tan(half)
  const horizontal = safe / Math.tan(Math.atan(Math.tan(half) * Math.max(aspect, 0.05)))
  return Math.max(vertical, horizontal, safe) * pad
}
