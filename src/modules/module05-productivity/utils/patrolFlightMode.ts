/** Chế độ bay flycam — mirror backend `patrol_flight_mode.py`. */

export type PatrolFlightMode = 'aerial' | 'proximity'

export interface PatrolFlycamGateFlags {
  flycam: boolean
  proximityFlycam: boolean
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
