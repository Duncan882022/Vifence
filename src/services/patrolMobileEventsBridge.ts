/** Sự kiện patrol từ MobileCameraFeed (HC-02) → panel Sự kiện Module 05 + heatmap dots. */
import type { PatrolEvent } from '@/modules/module05-productivity/data/patrolMockData'
import { mapBackendEventToPatrolEvent } from '@/modules/module05-productivity/services/patrolLiveEvents.service'
import { getMobileAiBackendUrl } from '@/modules/module02-training/services/mobileAiBackend.service'
import type { MobileAiViolationEvent } from '@/modules/module02-training/services/mobileAiBackend.service'
import {
  getPatrolHelmetGps,
  getPatrolHelmetGpsLastKnown,
} from '@/services/patrolHelmetGpsBridge'
import { syncPatrolPersonEventsToHeatmap } from '@/services/patrolHeatmapPersonRegistry'

const MAX_EVENTS = 80
const listeners = new Set<(events: PatrolEvent[]) => void>()
let eventsById = new Map<string, PatrolEvent>()

function notify(): void {
  const list = [...eventsById.values()].sort(
    (a, b) => new Date(b.lockedAt).getTime() - new Date(a.lockedAt).getTime(),
  )
  syncPatrolPersonEventsToHeatmap(list)
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

function isPatrolBackendRow(row: MobileAiViolationEvent): boolean {
  const scenario = row.scenario_id ?? ''
  const behavior = row.behavior ?? ''
  return scenario.startsWith('PPE')
    || scenario.startsWith('PERS')
    || ['no_helmet', 'no_vest', 'no_shoes', 'person'].includes(behavior)
}

export function pushPatrolMobilePpeEvents(
  rows: MobileAiViolationEvent[],
  cameraId = 'HC-02',
): void {
  if (!rows.length) return
  const backendUrl = getMobileAiBackendUrl() || ''
  let changed = false

  for (const row of rows) {
    if (!row.id || !isPatrolBackendRow(row)) continue

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
        worker_id: row.worker_id,
        worker_name: row.worker_name,
        gps_lat: gps.gps_lat,
        gps_lng: gps.gps_lng,
      },
      backendUrl,
    )

    const prev = eventsById.get(mapped.id)
    if (
      prev
      && prev.lockedAt === mapped.lockedAt
      && prev.gps.lat === mapped.gps.lat
      && prev.gps.lng === mapped.gps.lng
      && prev.snapshotUrl === mapped.snapshotUrl
    ) {
      continue
    }

    eventsById.set(mapped.id, mapped)
    changed = true
  }

  if (!changed) return

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
