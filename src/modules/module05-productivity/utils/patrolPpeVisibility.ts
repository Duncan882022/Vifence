/**
 * Module 05 / mũ HC — tạm ẩn toàn bộ PPE + ROI overlay trên camera và feed Sự kiện.
 * AI analyze vẫn chạy ngầm (person count / workforce); chỉ không vẽ box trên cam.
 */
export const PATROL_PPE_UI_HIDDEN = true

/** Ẩn mọi ROI/bbox trên camera mũ HC-* (kể cả person). */
export function shouldHidePatrolCameraRoi(cameraId: string): boolean {
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
