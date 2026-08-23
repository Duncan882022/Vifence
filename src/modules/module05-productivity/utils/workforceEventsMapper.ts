/**
 * Map workforce engine events → PatrolEvent for Module 05 feed.
 * specs/module05/REALTIME_WORKFORCE_HEATMAP_SPECIFICATION.md §8
 */
import type { PatrolEvent } from '../data/patrolMockData'
import type { WorkforceEventState, WorkforceEventType } from '../types/workforceHeatmap'
import { PATROL_BODYCAM_LABELS } from '../data/patrolCameras'
import { PATROL_SITE_CENTER, PATROL_SITE_NAME } from '../data/patrolSiteMap'

const WORKFORCE_FEED_TYPES = new Set<WorkforceEventType>([
  'POPULATION_OBSERVED',
  'POPULATION_CHANGE',
  'HIGH_DENSITY',
  'IDENTITY_VERIFIED',
  'MACHINE_STOPPED',
])

export function isWorkforceFeedEventType(type: string): type is WorkforceEventType {
  return WORKFORCE_FEED_TYPES.has(type as WorkforceEventType)
}

function isValidGps(lat: number, lng: number): boolean {
  return Number.isFinite(lat)
    && Number.isFinite(lng)
    && !(lat === 0 && lng === 0)
    && Math.abs(lat) <= 90
    && Math.abs(lng) <= 180
}

function resolveWorkforceEventGps(
  ev: WorkforceEventState,
  cameraId: string,
): { lat: number; lng: number } {
  const lat = Number(ev.payload?.lat ?? 0)
  const lng = Number(ev.payload?.lon ?? ev.payload?.lng ?? 0)
  if (isValidGps(lat, lng)) return { lat, lng }
  if (cameraId === 'HC-02' || cameraId === 'HC-01') {
    return { lat: PATROL_SITE_CENTER[0], lng: PATROL_SITE_CENTER[1] }
  }
  return { lat: 0, lng: 0 }
}

export function workforceEventToPatrolEvent(ev: WorkforceEventState): PatrolEvent | null {
  if (!isWorkforceFeedEventType(ev.event_type)) return null
  const cameraId = ev.helmet_id || 'HC-02'
  const cameraName = PATROL_BODYCAM_LABELS[cameraId] ?? cameraId
  const ts = ev.timestamp
  return {
    id: ev.event_id,
    type: ev.event_type as PatrolEvent['type'],
    cameraId,
    cameraName,
    zoneId: ev.zone_id,
    zoneName: PATROL_SITE_NAME,
    objectId: String(ev.payload?.object_id ?? ev.event_id),
    objectLabel: String(ev.payload?.worker_name ?? ev.payload?.object_id ?? ev.zone_id),
    violationLabel: ev.title || ev.description,
    startedAt: ts,
    lockedAt: ts,
    endedAt: null,
    durationSeconds: null,
    status: 'LOCKED',
    confidence: Number(ev.payload?.confidence ?? 0.9),
    gps: resolveWorkforceEventGps(ev, cameraId),
  }
}

export function mergePatrolAndWorkforceEvents(
  patrol: PatrolEvent[],
  workforce: WorkforceEventState[],
): PatrolEvent[] {
  const byId = new Map<string, PatrolEvent>()
  for (const ev of patrol) byId.set(ev.id, ev)
  for (const raw of workforce) {
    const mapped = workforceEventToPatrolEvent(raw)
    if (mapped) byId.set(mapped.id, mapped)
  }
  return [...byId.values()].sort(
    (a, b) => new Date(b.lockedAt).getTime() - new Date(a.lockedAt).getTime(),
  )
}
