import type { PatrolEvent } from '../data/patrolTypes'
import type { DetectionDot } from '../data/patrolDetectionData'
import type { PatrolDayPresence } from '../services/patrolDayEvents.service'
import { isPatrolDroneCameraId } from '../data/patrolDrones'
import type { PatrolFlightMode } from './patrolFlightMode'
import { patrolEventMatchesFlycamAltitude } from './patrolFlightMode'
import { resolvePatrolPersonStage } from './patrolWorkforceEventLabels'

/** Heatmap Module 05 — HC-* + DR-* tầm thấp; tầm cao dùng map riêng. */
export function isPatrolHeatmapFlycamDotIncluded(
  cameraId: string,
  flightModeByCamera: Record<string, PatrolFlightMode | string | null | undefined>,
): boolean {
  if (!isPatrolDroneCameraId(cameraId)) return true
  return (flightModeByCamera[cameraId] ?? 'aerial') === 'proximity'
}

export function filterPatrolHeatmapDotsExcludeAerialFlycam(
  dots: DetectionDot[],
  flightModeByCamera: Record<string, PatrolFlightMode | string | null | undefined>,
): DetectionDot[] {
  return dots.filter(dot => isPatrolHeatmapFlycamDotIncluded(dot.cameraId || '', flightModeByCamera))
}

export function filterPatrolPresencesForHeatmap(
  presences: PatrolDayPresence[],
  flightModeByCamera: Record<string, PatrolFlightMode | string | null | undefined>,
): PatrolDayPresence[] {
  return presences.filter(p => {
    const cam = p.cameraId || p.sourceCameras[0] || ''
    return isPatrolHeatmapFlycamDotIncluded(cam, flightModeByCamera)
  })
}

/** Lọc sự kiện flycam theo độ cao — tầm thấp giống hệt HC-*. */
export function filterPatrolEventsByFlycamAltitude(
  events: PatrolEvent[],
  flightModeByCamera: Record<string, PatrolFlightMode | string | null | undefined>,
): PatrolEvent[] {
  return events.filter(event => {
    if (!event.cameraId.startsWith('DR-')) return true
    const mode = flightModeByCamera[event.cameraId] ?? 'aerial'
    if (mode === 'proximity') return true
    return patrolEventMatchesFlycamAltitude(
      event,
      mode,
      e => resolvePatrolPersonStage(e as PatrolEvent),
    )
  })
}
