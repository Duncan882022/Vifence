import type { PatrolEvent } from '../data/patrolTypes'
import type { PatrolFlightMode } from './patrolFlightMode'
import { patrolEventMatchesFlycamAltitude } from './patrolFlightMode'
import { resolvePatrolPersonStage } from './patrolWorkforceEventLabels'

/** Lọc sự kiện flycam theo độ cao — khớp gate heatmap live. */
export function filterPatrolEventsByFlycamAltitude(
  events: PatrolEvent[],
  flightModeByCamera: Record<string, PatrolFlightMode | string | null | undefined>,
): PatrolEvent[] {
  return events.filter(event =>
    patrolEventMatchesFlycamAltitude(
      event,
      flightModeByCamera[event.cameraId] ?? 'aerial',
      e => resolvePatrolPersonStage(e as PatrolEvent),
    ),
  )
}
