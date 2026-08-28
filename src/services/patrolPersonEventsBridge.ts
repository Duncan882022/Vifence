/** Sự kiện vòng đời người từ MobileCameraFeed (HC-02) → heatmap. */
import type { PatrolEvent } from '@/modules/module05-productivity/data/patrolTypes'
import { mapBackendEventToPatrolEvent } from '@/modules/module05-productivity/services/patrolLiveEvents.service'
import { getMobileAiBackendUrl } from '@/modules/module02-training/services/mobileAiBackend.service'
import type { MobileAiViolationEvent } from '@/modules/module02-training/services/mobileAiBackend.service'
import {
  getPatrolHelmetGps,
  getPatrolHelmetGpsLastKnown,
} from '@/services/patrolHelmetGpsBridge'
import { syncPatrolPersonEventsToHeatmap } from '@/services/patrolHeatmapPersonRegistry'
import { PATROL_SITE_CENTER } from '@/modules/module05-productivity/data/patrolSiteMap'
import { applyManualIdentityToPatrolEvent } from '@/modules/module05-productivity/utils/patrolManualIdentityUi'
import { subscribePatrolManualIdentity } from '@/modules/module05-productivity/services/patrolManualIdentity.service'

const MAX_EVENTS = 80
let eventsById = new Map<string, PatrolEvent>()

function notify(): void {
  const list = [...eventsById.values()].sort(
    (a, b) => new Date(b.lockedAt).getTime() - new Date(a.lockedAt).getTime(),
  )
  syncPatrolPersonEventsToHeatmap(list)
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
  if (cameraId === 'HC-01' || cameraId === 'HC-02') {
    return { gps_lat: PATROL_SITE_CENTER[0], gps_lng: PATROL_SITE_CENTER[1] }
  }
  return { gps_lat: null, gps_lng: null }
}

/** Chỉ PERS-001 / person — bỏ mọi kịch bản ATLĐ legacy. */
function isPatrolPersonBackendRow(row: MobileAiViolationEvent): boolean {
  const scenario = (row.scenario_id ?? '').toUpperCase()
  const behavior = (row.behavior ?? '').toLowerCase()
  if (scenario.startsWith('PPE')) return false
  return scenario.startsWith('PERS') || behavior === 'person'
}

export function refreshPatrolMobileEventsIdentity(): void {
  if (eventsById.size === 0) return
  const next = new Map<string, PatrolEvent>()
  for (const [id, ev] of eventsById) {
    next.set(id, applyManualIdentityToPatrolEvent(ev))
  }
  eventsById = next
  notify()
}

export function pushPatrolMobilePersonEvents(
  rows: MobileAiViolationEvent[],
  cameraId = 'HC-02',
): void {
  if (!rows.length) return
  const backendUrl = getMobileAiBackendUrl() || ''
  let changed = false

  for (const row of rows) {
    if (!row.id || !isPatrolPersonBackendRow(row)) continue
    if (!row.snapshot_file?.trim()) continue

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
        track_id: row.track_id ?? null,
        object_id: row.object_id ?? null,
        gps_lat: gps.gps_lat,
        gps_lng: gps.gps_lng,
      },
      backendUrl,
    )
    if (!mapped) continue

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

export function clearPatrolMobilePersonEvents(): void {
  eventsById = new Map()
  notify()
}

let identityUnsub: (() => void) | null = null

function ensureIdentitySubscription(): void {
  if (identityUnsub) return
  identityUnsub = subscribePatrolManualIdentity(() => {
    refreshPatrolMobileEventsIdentity()
  })
}

ensureIdentitySubscription()
