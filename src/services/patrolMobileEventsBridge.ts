/** Sự kiện PPE từ MobileCameraFeed (HC-02) → panel Sự kiện Module 05. */
import type { PatrolEvent } from '@/modules/module05-productivity/data/patrolMockData'
import { mapBackendEventToPatrolEvent } from '@/modules/module05-productivity/services/patrolLiveEvents.service'
import { getMobileAiBackendUrl } from '@/modules/module02-training/services/mobileAiBackend.service'
import type { MobileAiViolationEvent } from '@/modules/module02-training/services/mobileAiBackend.service'
import {
  getPatrolHelmetGps,
  getPatrolHelmetGpsLastKnown,
} from '@/services/patrolHelmetGpsBridge'

const MAX_EVENTS = 80
const listeners = new Set<(events: PatrolEvent[]) => void>()
let eventsById = new Map<string, PatrolEvent>()

function notify(): void {
  const list = [...eventsById.values()].sort(
    (a, b) => new Date(b.lockedAt).getTime() - new Date(a.lockedAt).getTime(),
  )
  listeners.forEach(fn => fn(list))
}


function resolveGpsForMobileEvent(
  row: MobileAiViolationEvent,
  cameraId: string,
): { gps_lat: number | null; gps_lng: number | null } {
  const lat = row.gps_lat
  const lng = row.gps_lng
  if (
    typeof lat === 'number'
    && typeof lng === 'number'
    && Number.isFinite(lat)
    && Number.isFinite(lng)
    && !(lat === 0 && lng === 0)
  ) {
    return { gps_lat: lat, gps_lng: lng }
  }
  const snap = getPatrolHelmetGps(cameraId) ?? getPatrolHelmetGpsLastKnown(cameraId)
  if (snap) return { gps_lat: snap.lat, gps_lng: snap.lng }
  return { gps_lat: null, gps_lng: null }
}

export function pushPatrolMobilePpeEvents(
  rows: MobileAiViolationEvent[],
  cameraId = 'HC-02',
): void {
  if (!rows.length) return
  const backendUrl = getMobileAiBackendUrl() || ''
  let added = false
  for (const row of rows) {
    if (!row.id) continue
    if (eventsById.has(row.id)) continue
    const scenario = row.scenario_id ?? ''
    if (!scenario.startsWith('PPE') && !['no_helmet', 'no_vest', 'no_shoes'].includes(row.behavior)) {
      continue
    }
    const gps = resolveGpsForMobileEvent(row, cameraId)
    const mapped = mapBackendEventToPatrolEvent(
      {
        id: row.id,
        camera_id: row.camera_id ?? cameraId,
        scenario_id: row.scenario_id,
        scenario_name: row.scenario_name,
        behavior: row.behavior,
        confidence: row.confidence,
        created_at: row.created_at,
        confirmed_at: row.created_at,
        snapshot_file: row.snapshot_file,
        gps_lat: gps.gps_lat,
        gps_lng: gps.gps_lng,
      },
      backendUrl,
    )
    eventsById.set(mapped.id, mapped)
    added = true
  }
  if (!added) return
  if (eventsById.size > MAX_EVENTS) {
    const sorted = [...eventsById.values()].sort(
      (a, b) => new Date(b.lockedAt).getTime() - new Date(a.lockedAt).getTime(),
    )
    eventsById = new Map(sorted.slice(0, MAX_EVENTS).map(e => [e.id, e]))
  }
  notify()
}

export function getPatrolMobilePpeEvents(): PatrolEvent[] {
  return [...eventsById.values()].sort(
    (a, b) => new Date(b.lockedAt).getTime() - new Date(a.lockedAt).getTime(),
  )
}

export function subscribePatrolMobilePpeEvents(
  listener: (events: PatrolEvent[]) => void,
): () => void {
  listeners.add(listener)
  listener(getPatrolMobilePpeEvents())
  return () => listeners.delete(listener)
}

export function clearPatrolMobilePpeEvents(): void {
  eventsById = new Map()
  notify()
}
