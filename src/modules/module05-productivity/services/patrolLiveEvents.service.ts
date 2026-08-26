import { getVmsBackendUrl } from '@/modules/module03-safety/services/vmsDetections.service'
import { getMobileAiBackendUrl } from '@/modules/module02-training/services/mobileAiBackend.service'
import {
  getPatrolHelmetGps,
  getPatrolHelmetGpsLastKnown,
} from '@/services/patrolHelmetGpsBridge'
import type { EventType, PatrolEvent } from '../data/patrolMockData'
import { PATROL_HELMET_ZONE_ASSIGNMENTS, PATROL_SITE_CENTER } from '../data/patrolSiteMap'
import { PATROL_BODYCAM_LABELS } from '../data/patrolCameras'
import { isPatrolHelmetCameraId, isPatrolMetricsCameraId } from '../data/patrolHelmetScope'
import { unixSecondsToIso, normalizeUnixSeconds } from '../utils/patrolEventsFeed'
import {
  formatPatrolPersonDetectedEvent,
  isPatrolObjectId,
  isPatrolSgcWorkerId,
  patrolWorkforceEventTitle,
} from '../utils/patrolWorkforceEventLabels'
import { isPatrolGalleryWorkerId } from '../utils/patrolIdentityEntity'
import { findPatrolIdentityByWorkerId } from '../services/patrolManualIdentity.service'

const ZONE_LABELS: Record<string, string> = {
  ZONE_SITE: 'Cầu Sông Hốt',
  ZONE_A: 'Cầu Sông Hốt',
}

const TUNNEL_HEADERS: Record<string, string> = {
  'ngrok-skip-browser-warning': 'true',
}

interface BackendViolationEvent {
  id: string
  camera_id?: string
  scenario_id?: string
  scenario_name?: string
  behavior?: string
  confidence?: number
  created_at?: number
  confirmed_at?: number
  snapshot_file?: string | null
  worker_id?: string | null
  worker_name?: string | null
  dedup_key?: string | null
  track_id?: string | null
  object_id?: string | null
  gps_lat?: number | null
  gps_lng?: number | null
}

export interface PatrolHelmetMetricsResponse {
  camera_id: string
  backend_reachable: boolean
  stream_online: boolean
  person_count: number
  identified_workers: number
  worker_names: string[]
  person_events_today: number
  gps_lat?: number | null
  gps_lng?: number | null
}

export interface PatrolHelmetCameraMetricsSlice {
  camera_id: string
  stream_online: boolean
  person_count: number
  identified_workers: number
  person_events_today: number
  gps_lat?: number | null
  gps_lng?: number | null
}

export interface PatrolHelmetAggregateMetricsResponse {
  cameras: PatrolHelmetCameraMetricsSlice[]
  backend_reachable: boolean
  stream_online: boolean
  person_count: number
  identified_workers: number
  worker_names: string[]
  person_events_today: number
}

function normalizePersonEventsToday(row: Record<string, unknown>): number {
  const primary = row.person_events_today
  if (typeof primary === 'number' && Number.isFinite(primary)) return primary
  const legacy = row.ppe_alerts_today
  if (typeof legacy === 'number' && Number.isFinite(legacy)) return legacy
  return 0
}

function normalizeMetricsResponse<T extends Record<string, unknown>>(row: T): T {
  return {
    ...row,
    person_events_today: normalizePersonEventsToday(row),
  }
}

function normalizeCameraSlice(row: Record<string, unknown>): PatrolHelmetCameraMetricsSlice {
  return {
    camera_id: String(row.camera_id ?? ''),
    stream_online: Boolean(row.stream_online),
    person_count: Number(row.person_count ?? 0),
    identified_workers: Number(row.identified_workers ?? 0),
    person_events_today: normalizePersonEventsToday(row),
    gps_lat: row.gps_lat as number | null | undefined,
    gps_lng: row.gps_lng as number | null | undefined,
  }
}

/** Contabo cũ chưa deploy /patrol/* — cache để tránh spam 404. */
const patrolApiByBase = new Map<string, boolean>()

function todayIsoDate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Module 05 chỉ nhận vòng đời người (PERS-*) — kịch bản PPE chặn ngay tại biên. */
function isPatrolModuleBackendEvent(row: BackendViolationEvent): boolean {
  if (!isPatrolHelmetCameraId(row.camera_id ?? '')) return false
  if (!row.snapshot_file?.trim()) return false
  return (row.scenario_id ?? '').toUpperCase().startsWith('PERS')
}

function patrolApiBase(backendUrl: string): string {
  return backendUrl.replace(/\/$/, '')
}

async function probePatrolApi(backendUrl: string): Promise<boolean> {
  const base = patrolApiBase(backendUrl)
  const cached = patrolApiByBase.get(base)
  if (cached !== undefined) return cached

  try {
    const res = await fetch(`${base}/patrol/metrics?cameras=HC-02`, {
      headers: TUNNEL_HEADERS,
      mode: 'cors',
    })
    const ok = res.ok
    patrolApiByBase.set(base, ok)
    return ok
  } catch {
    patrolApiByBase.set(base, false)
    return false
  }
}

/** Legacy Contabo: GET /events?camera_id=&date= */
async function fetchLegacyHelmetEvents(
  cameraId: string,
  backendUrl: string,
  limit = 500,
): Promise<BackendViolationEvent[]> {
  if (!isPatrolHelmetCameraId(cameraId)) return []
  const date = todayIsoDate()
  const params = new URLSearchParams({
    limit: String(limit),
    date,
    camera_id: cameraId,
  })
  const res = await fetch(`${patrolApiBase(backendUrl)}/events?${params.toString()}`, {
    headers: TUNNEL_HEADERS,
    mode: 'cors',
  })
  if (!res.ok) return []
  const rows = await res.json() as BackendViolationEvent[]
  return rows.filter(isPatrolModuleBackendEvent)
}

function emptyCameraMetrics(cameraId: string, eventsToday = 0): PatrolHelmetCameraMetricsSlice {
  return {
    camera_id: cameraId,
    stream_online: false,
    person_count: 0,
    identified_workers: 0,
    person_events_today: eventsToday,
    gps_lat: null,
    gps_lng: null,
  }
}

/** Metrics khi chưa có /patrol — chỉ biết alerts từ /events; person_count do bridge mobile. */
async function fetchLegacyAggregateMetrics(
  cameraIds: readonly string[],
  backendUrl: string,
): Promise<PatrolHelmetAggregateMetricsResponse> {
  const ids = cameraIds.filter(isPatrolHelmetCameraId)
  const cameras: PatrolHelmetCameraMetricsSlice[] = []
  let totalEvents = 0

  for (const id of ids) {
    const events = await fetchLegacyHelmetEvents(id, backendUrl, 500)
    totalEvents += events.length
    cameras.push(emptyCameraMetrics(id, events.length))
  }

  return {
    cameras,
    backend_reachable: true,
    stream_online: false,
    person_count: 0,
    identified_workers: 0,
    worker_names: [],
    person_events_today: totalEvents,
  }
}

export async function fetchPatrolHelmetMetrics(
  cameraId: string,
  backendUrl = getVmsBackendUrl(),
): Promise<PatrolHelmetMetricsResponse | null> {
  if (!backendUrl || !isPatrolMetricsCameraId(cameraId)) return null

  const hasPatrol = await probePatrolApi(backendUrl)
  if (hasPatrol) {
    const res = await fetch(`${patrolApiBase(backendUrl)}/patrol/${cameraId}/metrics`, {
      headers: TUNNEL_HEADERS,
      mode: 'cors',
    })
    if (!res.ok) return null
    const raw = await res.json() as Record<string, unknown>
    return normalizeMetricsResponse(raw) as unknown as PatrolHelmetMetricsResponse
  }

  const events = await fetchLegacyHelmetEvents(cameraId, backendUrl, 500)
  const gps = cameraId === 'HC-02' ? getPatrolHelmetGps(cameraId) : null
  return {
    camera_id: cameraId,
    backend_reachable: true,
    stream_online: false,
    person_count: 0,
    identified_workers: 0,
    worker_names: [],
    person_events_today: events.length,
    gps_lat: gps?.lat ?? null,
    gps_lng: gps?.lng ?? null,
  }
}

export async function fetchPatrolHelmetAggregateMetrics(
  cameraIds: readonly string[],
  backendUrl = getVmsBackendUrl(),
): Promise<PatrolHelmetAggregateMetricsResponse | null> {
  const ids = cameraIds.filter(isPatrolMetricsCameraId)
  if (!backendUrl || ids.length === 0) return null

  const hasPatrol = await probePatrolApi(backendUrl)
  if (hasPatrol) {
    const params = new URLSearchParams({ cameras: ids.join(',') })
    const res = await fetch(`${patrolApiBase(backendUrl)}/patrol/metrics?${params.toString()}`, {
      headers: TUNNEL_HEADERS,
      mode: 'cors',
    })
    if (!res.ok) return null
    const raw = await res.json() as Record<string, unknown>
    const cameras = Array.isArray(raw.cameras)
      ? raw.cameras.map(row => normalizeCameraSlice(row as Record<string, unknown>))
      : []
    return normalizeMetricsResponse({ ...raw, cameras }) as unknown as PatrolHelmetAggregateMetricsResponse
  }

  return fetchLegacyAggregateMetrics(ids, backendUrl)
}

function buildSnapshotUrl(backendUrl: string, eventId: string, snapshotFile: string, versionTs?: number): string {
  const base = `${patrolApiBase(backendUrl)}/events/${eventId}/snapshot`
  const v = versionTs ?? snapshotFile
  return `${base}?v=${encodeURIComponent(String(v))}`
}

function eventTypeFromScenario(scenarioId: string | undefined, behavior?: string): EventType {
  if (scenarioId?.startsWith('IDEN')) return 'IDENTITY_VERIFIED'
  if (behavior === 'population') return 'POPULATION_OBSERVED'
  return 'PERSON_DETECTED'
}

function zoneMetaForCamera(cameraId: string): { zoneId: string; zoneName: string } {
  const row = PATROL_HELMET_ZONE_ASSIGNMENTS.find(z => z.helmetId === cameraId)
  const zoneId = row?.zoneId ?? 'ZONE_SITE'
  return { zoneId, zoneName: ZONE_LABELS[zoneId] ?? zoneId }
}

function resolveEventGps(
  event: BackendViolationEvent,
  cameraId: string,
): { lat: number; lng: number } {
  const lat = event.gps_lat
  const lng = event.gps_lng
  if (
    typeof lat === 'number'
    && typeof lng === 'number'
    && Number.isFinite(lat)
    && Number.isFinite(lng)
    && !(lat === 0 && lng === 0)
  ) {
    return { lat, lng }
  }
  if (cameraId === 'HC-02') {
    const snap = getPatrolHelmetGps(cameraId) ?? getPatrolHelmetGpsLastKnown(cameraId)
    if (snap) return { lat: snap.lat, lng: snap.lng }
    return { lat: PATROL_SITE_CENTER[0], lng: PATROL_SITE_CENTER[1] }
  }
  if (cameraId === 'HC-01') {
    return { lat: PATROL_SITE_CENTER[0], lng: PATROL_SITE_CENTER[1] }
  }
  return { lat: 0, lng: 0 }
}

export function mapBackendEventToPatrolEvent(
  event: BackendViolationEvent,
  backendUrl: string,
): PatrolEvent | null {
  const cameraId = event.camera_id ?? 'HC-01'
  const snapshotFile = event.snapshot_file?.trim()
  if (!snapshotFile) return null

  const ts = event.confirmed_at ?? event.created_at
  const lockedIso = unixSecondsToIso(ts)
  const createdIso = unixSecondsToIso(event.created_at) ?? lockedIso
  if (!lockedIso || !createdIso) return null

  const { zoneId, zoneName } = zoneMetaForCamera(cameraId)
  const workerIdRaw = event.worker_id?.trim() ?? ''
  const workerNameRaw = event.worker_name?.trim() ?? ''
  const objectIdRaw = event.object_id?.trim()
  const dedupTail = event.dedup_key?.split('|').pop()?.trim() ?? ''
  const isGalleryWorker = isPatrolGalleryWorkerId(workerIdRaw)
  let trackWorkerId = isPatrolSgcWorkerId(workerIdRaw) ? workerIdRaw : undefined
  const objectId = objectIdRaw && isPatrolObjectId(objectIdRaw)
    ? objectIdRaw
    : isGalleryWorker
      ? workerIdRaw
      : (trackWorkerId
        ?? ((workerIdRaw && !/^[0-9a-f]{6,16}$/i.test(workerIdRaw) ? workerIdRaw : '')
          || dedupTail
          || ''))
  if (isGalleryWorker && !trackWorkerId) {
    const manual = findPatrolIdentityByWorkerId(workerIdRaw)
    const sgcAlias = manual?.objectKeys.find(k => isPatrolSgcWorkerId(k))
    if (sgcAlias) trackWorkerId = sgcAlias
  }
  const objectLabelHint = isGalleryWorker && workerNameRaw ? workerNameRaw : undefined
  const eventType = eventTypeFromScenario(event.scenario_id, event.behavior)
  const title = patrolWorkforceEventTitle(eventType, objectId, objectLabelHint ?? workerIdRaw, trackWorkerId)
  const versionTs = normalizeUnixSeconds(ts) ?? undefined

  const mapped: PatrolEvent = {
    id: event.id,
    type: eventType,
    cameraId,
    cameraName: PATROL_BODYCAM_LABELS[cameraId] ?? cameraId,
    zoneId,
    zoneName,
    objectLabel: objectLabelHint ?? objectId,
    objectId,
    trackWorkerId: isGalleryWorker ? undefined : trackWorkerId,
    violationLabel: eventType === 'PERSON_DETECTED'
      ? title
      : (event.scenario_name ?? event.scenario_id ?? 'Phát hiện người'),
    startedAt: createdIso,
    lockedAt: lockedIso,
    endedAt: null,
    durationSeconds: null,
    status: 'LOCKED',
    confidence: Number(event.confidence ?? 0),
    gps: resolveEventGps(event, cameraId),
    snapshotUrl: buildSnapshotUrl(backendUrl, event.id, snapshotFile, versionTs),
  }

  return eventType === 'PERSON_DETECTED'
    ? formatPatrolPersonDetectedEvent(mapped)
    : mapped
}

export interface ClearBackendEventsResult {
  memory: number
  files: number
  dedup_keys: number
}

/** DELETE /events — xóa RAM + JSONL + snapshot trên backend (test mới). */
export async function clearAllPatrolBackendEvents(
  backendUrl = getMobileAiBackendUrl() || getVmsBackendUrl(),
): Promise<ClearBackendEventsResult | null> {
  const base = backendUrl?.replace(/\/$/, '')
  if (!base) return null
  const res = await fetch(`${base}/events`, {
    method: 'DELETE',
    headers: TUNNEL_HEADERS,
    mode: 'cors',
  })
  if (!res.ok) {
    throw new Error(`clear events failed: HTTP ${res.status}`)
  }
  return (await res.json()) as ClearBackendEventsResult
}
