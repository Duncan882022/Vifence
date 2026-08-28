/** Chế độ bay flycam — mirror backend `patrol_flight_mode.py`. */

export type PatrolFlightMode = 'aerial' | 'proximity'

export interface PatrolFlycamGateFlags {
  flycam: boolean
  proximityFlycam: boolean
}

/** Đọc từ overlay metrics (`metrics.ppe.flight_mode`). */
export function resolvePatrolFlycamGateFlags(
  cameraId: string,
  flightMode?: string | null,
): PatrolFlycamGateFlags {
  if (!cameraId.startsWith('DR-')) {
    return { flycam: false, proximityFlycam: false }
  }
  if (flightMode === 'proximity') {
    return { flycam: false, proximityFlycam: true }
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
