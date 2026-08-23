/**
 * Map workforce engine events → PatrolEvent for Module 05 feed.
 * docs/module05/REALTIME_WORKFORCE_HEATMAP_SPECIFICATION.md §8
 */
import type { PatrolEvent } from '../data/patrolMockData'
import type { WorkforceEventState, WorkforceEventType } from '../types/workforceHeatmap'

const WORKFORCE_FEED_TYPES = new Set<WorkforceEventType>([
  'POPULATION_OBSERVED',
  'POPULATION_CHANGE',
  'HIGH_DENSITY',
  'IDENTITY_VERIFIED',
])

export function isWorkforceFeedEventType(type: string): type is WorkforceEventType {
  return WORKFORCE_FEED_TYPES.has(type as WorkforceEventType)
}

export function workforceEventToPatrolEvent(ev: WorkforceEventState): PatrolEvent | null {
  if (!isWorkforceFeedEventType(ev.event_type)) return null
  const cameraId = ev.helmet_id || 'HC-02'
  const ts = ev.timestamp
  return {
    id: ev.event_id,
    type: ev.event_type as PatrolEvent['type'],
    cameraId,
    cameraName: cameraId,
    zoneId: ev.zone_id,
    zoneName: ev.zone_id.replace(/^ZONE-?/, 'Zone '),
    objectId: String(ev.payload?.object_id ?? ev.event_id),
    objectLabel: String(ev.payload?.worker_name ?? ev.payload?.object_id ?? ev.zone_id),
    violationLabel: ev.title || ev.description,
    startedAt: ts,
    lockedAt: ts,
    endedAt: null,
    durationSeconds: null,
    status: 'LOCKED',
    confidence: Number(ev.payload?.confidence ?? 0.9),
    gps: {
      lat: Number(ev.payload?.lat ?? 0),
      lng: Number(ev.payload?.lon ?? ev.payload?.lng ?? 0),
    },
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
