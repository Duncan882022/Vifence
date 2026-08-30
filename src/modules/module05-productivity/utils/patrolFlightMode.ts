/** Chế độ bay flycam — mirror backend `patrol_flight_mode.py`. */

import { getPatrolFlightMode } from '@/services/patrolFlightModeBridge'

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

/** VMS worker ghi metrics patrol cho HC-/DR-*. */
export function readPatrolFlightModeFromMetrics(
  metrics?: Record<string, unknown> | null,
): PatrolFlightMode | null {
  if (!metrics) return null
  const nested = metrics.patrol
  if (nested && typeof nested === 'object') {
    const mode = (nested as Record<string, unknown>).flight_mode
    if (mode === 'proximity' || mode === 'aerial') return mode
  }
  const top = metrics.flight_mode
  if (top === 'proximity' || top === 'aerial') return top
  return null
}

/**
 * flight_mode hiệu lực cho gate sự kiện / label — metrics snapshot ưu tiên.
 * Không dùng bridge TTL cho ROI gate (DR dùng patrolPersonMeetsDrFlycamDisplayGate).
 */
export function resolveEffectivePatrolFlightMode(
  cameraId: string,
  metrics?: Record<string, unknown> | null,
): PatrolFlightMode | null {
  const fromMetrics = readPatrolFlightModeFromMetrics(metrics)
  if (fromMetrics) return fromMetrics
  if (cameraId.startsWith('DR-')) {
    return getPatrolFlightMode(cameraId) ?? 'aerial'
  }
  return null
}

/** Đọc từ overlay metrics VMS hoặc `/analyze/frame`. */
export function resolvePatrolFlycamGateFlags(
  cameraId: string,
  flightMode?: string | null,
): PatrolFlycamGateFlags {
  if (cameraId.startsWith('HC-')) {
    return { flycam: false, proximityFlycam: false }
  }
  if (cameraId.startsWith('DR-')) {
    if (flightMode === 'proximity') {
      return { flycam: false, proximityFlycam: true }
    }
    return { flycam: true, proximityFlycam: false }
  }
  return { flycam: false, proximityFlycam: false }
}

export function patrolFlightModeLabel(mode: PatrolFlightMode | string | null | undefined): string {
  if (mode === 'proximity') return 'Tầm thấp · AI'
  return 'Tầm cao · Mật độ'
}

/** Badge góc tile — rút gọn khi grid compact. */
export function patrolFlightModeShortLabel(mode: PatrolFlightMode | string | null | undefined): string {
  if (mode === 'proximity') return 'Tầm thấp'
  return 'Tầm cao'
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
