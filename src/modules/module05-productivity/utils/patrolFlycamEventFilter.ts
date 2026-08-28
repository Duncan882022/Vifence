import type { PatrolEvent } from '../data/patrolTypes'
import type { PatrolFlightMode } from './patrolFlightMode'
import { patrolEventMatchesFlycamAltitude } from './patrolFlightMode'
import { resolvePatrolPersonStage } from './patrolWorkforceEventLabels'

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
