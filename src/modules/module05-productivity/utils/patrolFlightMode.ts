/** Chế độ bay flycam — mirror backend `patrol_flight_mode.py`. */

export type PatrolFlightMode = 'aerial' | 'proximity'

export interface PatrolFlycamGateFlags {
  flycam: boolean
  proximityFlycam: boolean
}

/** HC-* luôn; DR-* tầm thấp — cùng gate/pipeline với mũ. */
export function isPatrolHelmetLikeCamera(
  cameraId: string,
  flightMode?: PatrolFlightMode | string | null,
): boolean {
  if (cameraId.startsWith('HC-')) return true
  if (cameraId.startsWith('DR-')) return flightMode === 'proximity'
  return false
}

/** VMS worker ghi metrics theo tên engine — patrol DR-* là `patrol`, A-04 là `ppe`. */
export function readPatrolFlightModeFromMetrics(
  metrics?: Record<string, unknown> | null,
): PatrolFlightMode | null {
  if (!metrics) return null
  for (const bucket of ['patrol', 'ppe'] as const) {
    const nested = metrics[bucket]
    if (!nested || typeof nested !== 'object') continue
    const mode = (nested as Record<string, unknown>).flight_mode
    if (mode === 'proximity' || mode === 'aerial') return mode
  }
  const top = metrics.flight_mode
  if (top === 'proximity' || top === 'aerial') return top
  return null
}

/** Đọc từ overlay metrics VMS hoặc `/analyze/frame`. */
export function resolvePatrolFlycamGateFlags(
  cameraId: string,
  flightMode?: string | null,
): PatrolFlycamGateFlags {
  if (isPatrolHelmetLikeCamera(cameraId, flightMode)) {
    return { flycam: false, proximityFlycam: false }
  }
  if (!cameraId.startsWith('DR-')) {
    return { flycam: false, proximityFlycam: false }
  }
  // Mặc định / aerial / chưa có telemetry → gate silhouette tầm cao.
  return { flycam: true, proximityFlycam: false }
}

export function patrolFlightModeLabel(mode: PatrolFlightMode | string | null | undefined): string {
  if (mode === 'proximity') return 'Tầm thấp · AI'
  return 'Tầm cao · Mật độ'
}

/** Sự kiện flycam khớp gate heatmap theo độ cao hiện tại. */
export function patrolEventMatchesFlycamAltitude(
  event: { cameraId: string; type: string; stage?: 'object' | 'person' | 'profile'; objectId?: string; trackWorkerId?: string },
  flightMode: PatrolFlightMode | string | null | undefined,
  resolveStage?: (event: { stage?: 'object' | 'person' | 'profile'; type: string; objectId?: string; trackWorkerId?: string }) => 'object' | 'person' | 'profile',
): boolean {
  if (!event.cameraId.startsWith('DR-')) return true

  const stage = event.stage ?? resolveStage?.(event) ?? 'object'
  const isProximity = flightMode === 'proximity'

  if (isProximity) {
    return stage === 'person' || stage === 'profile' || event.type === 'IDENTITY_VERIFIED'
  }

  return (
    stage === 'object'
    || event.type === 'POPULATION_OBSERVED'
    || event.type === 'POPULATION_CHANGE'
    || event.type === 'HIGH_DENSITY'
  )
}
