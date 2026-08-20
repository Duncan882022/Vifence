/**
 * Mock API service — HQCV §40 endpoints.
 * Production: replace `delay + return MOCK_*` with real axios/fetch calls.
 */
import {
  MOCK_PATROL_DASHBOARD,
  MOCK_PATROL_EVENTS,
  MOCK_PATROL_ZONES,
  type PatrolDashboard,
  type PatrolEvent,
  type PatrolZone,
} from '../data/patrolMockData'

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/** GET /api/patrol/{patrol_id}/dashboard */
export async function fetchPatrolDashboard(
  _patrolId: string,
): Promise<PatrolDashboard> {
  await delay(120)
  return { ...MOCK_PATROL_DASHBOARD }
}

/** GET /api/patrol/{patrol_id}/zones */
export async function fetchPatrolZones(
  _patrolId: string,
): Promise<PatrolZone[]> {
  await delay(150)
  return MOCK_PATROL_ZONES.map(z => ({ ...z }))
}

export interface PatrolHeatmapPayload {
  patrolId: string
  timestamp: string
  zones: Array<{
    zone_id: string
    /** Number of unique objects detected in this session (cross-frame dedup). */
    latest_scan: {
      people_current: number
      vehicles_current: number
      timestamp: string
    }
    patrol_session: {
      unique_people: number
      unique_vehicles: number
    }
    coverage: {
      visited: boolean
      dwell_seconds: number
      last_visit: string | null
    }
  }>
}

/** GET /api/patrol/{patrol_id}/heatmap */
export async function fetchPatrolHeatmap(
  _patrolId: string,
): Promise<PatrolHeatmapPayload> {
  await delay(180)
  const now = new Date().toISOString()
  return {
    patrolId: _patrolId,
    timestamp: now,
    zones: MOCK_PATROL_ZONES.map(z => ({
      zone_id: z.id,
      latest_scan: {
        people_current: z.peopleCurrent,
        vehicles_current: z.vehiclesCurrent,
        timestamp: now,
      },
      patrol_session: {
        unique_people: z.uniquePeople,
        unique_vehicles: z.uniqueVehicles,
      },
      coverage: {
        visited: z.coverage === 'VISITED',
        dwell_seconds: z.dwellSeconds,
        last_visit: z.coverage === 'VISITED' ? now : null,
      },
    })),
  }
}

/** GET /api/patrol/{patrol_id}/events */
export async function fetchPatrolEvents(
  _patrolId: string,
): Promise<PatrolEvent[]> {
  await delay(120)
  return MOCK_PATROL_EVENTS.map(e => ({ ...e }))
}

/** GET /api/events/{event_id} */
export async function fetchPatrolEventDetail(
  eventId: string,
): Promise<PatrolEvent | null> {
  await delay(80)
  return MOCK_PATROL_EVENTS.find(e => e.id === eventId) ?? null
}
