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
