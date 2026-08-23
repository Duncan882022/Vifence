/**
 * Module 05 / mũ HC — ẩn vi phạm PPE + sự kiện PPE; vẫn vẽ bbox person trên camera.
 * AI analyze vẫn chạy ngầm (person count / workforce).
 */
export const PATROL_PPE_UI_HIDDEN = true

/** @deprecated Dùng shouldHidePatrolPpeViolationOverlay — person ROI luôn được phép trên HC-*. */
export function shouldHidePatrolCameraRoi(_cameraId: string): boolean {
  return false
}

/** Ẩn bbox vi phạm PPE (no_helmet, no_vest…) — không ẩn bbox person. */
export function shouldHidePatrolPpeViolationOverlay(cameraId: string): boolean {
  if (!PATROL_PPE_UI_HIDDEN) return false
  return cameraId.startsWith('HC-')
}

export function isPatrolPpeEventType(type: string): boolean {
  return type === 'PPE_VIOLATION'
}

export function stripPatrolPpeEvents<T extends { type: string }>(events: T[]): T[] {
  if (!PATROL_PPE_UI_HIDDEN) return events
  return events.filter(e => !isPatrolPpeEventType(e.type))
}

export function isPatrolPpeScenarioOrBehavior(scenarioId?: string | null, behavior?: string | null): boolean {
  const scenario = (scenarioId ?? '').toUpperCase()
  const b = (behavior ?? '').toLowerCase()
  if (scenario.startsWith('PPE')) return true
  return ['no_helmet', 'no_vest', 'no_shoes', 'no_hardhat', 'no_hat'].includes(b)
}
