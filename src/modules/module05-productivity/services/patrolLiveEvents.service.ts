import { getVmsBackendUrl } from '@/modules/module03-safety/services/vmsDetections.service'
import {
  getPatrolHelmetGps,
  getPatrolHelmetGpsLastKnown,
} from '@/services/patrolHelmetGpsBridge'
import type { EventType, PatrolEvent } from '../data/patrolMockData'
import { PATROL_HELMET_ZONE_ASSIGNMENTS } from '../data/patrolSiteMap'
import { isPatrolHelmetCameraId } from '../data/patrolHelmetScope'
import { PATROL_PPE_UI_HIDDEN } from '../utils/patrolPpeVisibility'

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
  gps_lat?: number | null
  gps_lng?: number | null
}

export interface PatrolHelmetMetricsResponse {
  camera_id: string
  backend_reachable: boolean
  stream_online: boolean
  person_count: number
  ppe_violations: number
  identified_workers: number
  worker_names: string[]
  ppe_alerts_today: number
  gps_lat?: number | null
  gps_lng?: number | null
}

export interface PatrolHelmetCameraMetricsSlice {
  camera_id: string
  stream_online: boolean
  person_count: number
  ppe_violations: number
  identified_workers: number
  ppe_alerts_today: number
  gps_lat?: number | null
  gps_lng?: number | null
}

export interface PatrolHelmetAggregateMetricsResponse {
  cameras: PatrolHelmetCameraMetricsSlice[]
  backend_reachable: boolean
  stream_online: boolean
  person_count: number
  ppe_violations: number
  identified_workers: number
  worker_names: string[]
  ppe_alerts_today: number
}

/** Contabo cũ chưa deploy /patrol/* — cache để tránh spam 404. */
const patrolApiByBase = new Map<string, boolean>()

function todayIsoDate(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function isPatrolModuleBackendEvent(row: BackendViolationEvent): boolean {
  if (!isPatrolHelmetCameraId(row.camera_id ?? '')) return false
  const scenarioId = row.scenario_id ?? ''
  if (PATROL_PPE_UI_HIDDEN && scenarioId.startsWith('PPE')) return false
  return scenarioId.startsWith('PPE') || scenarioId.startsWith('PERS')
}

/** @deprecated use isPatrolModuleBackendEvent */
function isPatrolPpeBackendEvent(row: BackendViolationEvent): boolean {
  return isPatrolModuleBackendEvent(row)
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
  return rows.filter(isPatrolPpeBackendEvent)
}

async function fetchLegacyAggregateEvents(
  cameraIds: readonly string[],
  backendUrl: string,
  limit = 500,
): Promise<BackendViolationEvent[]> {
  const ids = cameraIds.filter(isPatrolHelmetCameraId)
  if (ids.length === 0) return []
  const chunks = await Promise.all(
    ids.map(id => fetchLegacyHelmetEvents(id, backendUrl, limit)),
  )
  const byId = new Map<string, BackendViolationEvent>()
  for (const rows of chunks) {
    for (const row of rows) byId.set(row.id, row)
  }
  return [...byId.values()].sort(
    (a, b) => Number(b.confirmed_at ?? b.created_at ?? 0) - Number(a.confirmed_at ?? a.created_at ?? 0),
  )
}

function emptyCameraMetrics(cameraId: string, alertsToday = 0): PatrolHelmetCameraMetricsSlice {
  return {
    camera_id: cameraId,
    stream_online: false,
    person_count: 0,
    ppe_violations: 0,
    identified_workers: 0,
    ppe_alerts_today: alertsToday,
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
  let totalAlerts = 0

  for (const id of ids) {
    const events = await fetchLegacyHelmetEvents(id, backendUrl, 500)
    const alerts = events.length
    totalAlerts += alerts
    cameras.push(emptyCameraMetrics(id, alerts))
  }

  return {
    cameras,
    backend_reachable: true,
    stream_online: false,
    person_count: 0,
    ppe_violations: 0,
    identified_workers: 0,
    worker_names: [],
    ppe_alerts_today: totalAlerts,
  }
}

export async function fetchPatrolHelmetMetrics(
  cameraId: string,
  backendUrl = getVmsBackendUrl(),
): Promise<PatrolHelmetMetricsResponse | null> {
  if (!backendUrl || !isPatrolHelmetCameraId(cameraId)) return null

  const hasPatrol = await probePatrolApi(backendUrl)
  if (hasPatrol) {
    const res = await fetch(`${patrolApiBase(backendUrl)}/patrol/${cameraId}/metrics`, {
      headers: TUNNEL_HEADERS,
      mode: 'cors',
    })
    if (!res.ok) return null
    return res.json() as Promise<PatrolHelmetMetricsResponse>
  }

  const events = await fetchLegacyHelmetEvents(cameraId, backendUrl, 500)
  const gps = cameraId === 'HC-02' ? getPatrolHelmetGps(cameraId) : null
  return {
    camera_id: cameraId,
    backend_reachable: true,
    stream_online: false,
    person_count: 0,
    ppe_violations: 0,
    identified_workers: 0,
    worker_names: [],
    ppe_alerts_today: events.length,
    gps_lat: gps?.lat ?? null,
    gps_lng: gps?.lng ?? null,
  }
}

export async function fetchPatrolHelmetAggregateMetrics(
  cameraIds: readonly string[],
  backendUrl = getVmsBackendUrl(),
): Promise<PatrolHelmetAggregateMetricsResponse | null> {
  const ids = cameraIds.filter(isPatrolHelmetCameraId)
  if (!backendUrl || ids.length === 0) return null

  const hasPatrol = await probePatrolApi(backendUrl)
  if (hasPatrol) {
    const params = new URLSearchParams({ cameras: ids.join(',') })
    const res = await fetch(`${patrolApiBase(backendUrl)}/patrol/metrics?${params.toString()}`, {
      headers: TUNNEL_HEADERS,
      mode: 'cors',
    })
    if (!res.ok) return null
    return res.json() as Promise<PatrolHelmetAggregateMetricsResponse>
  }

  return fetchLegacyAggregateMetrics(ids, backendUrl)
}

export async function fetchPatrolHelmetPpeAlertCount(
  cameraId: string,
  backendUrl = getVmsBackendUrl(),
): Promise<number> {
  const metrics = await fetchPatrolHelmetMetrics(cameraId, backendUrl)
  return metrics?.ppe_alerts_today ?? 0
}

function unixToIso(ts: number | undefined): string {
  if (!ts || !Number.isFinite(ts)) return new Date().toISOString()
  return new Date(ts * 1000).toISOString()
}

function buildSnapshotUrl(backendUrl: string, eventId: string, versionTs?: number): string {
  const base = `${patrolApiBase(backendUrl)}/events/${eventId}/snapshot`
  if (!versionTs) return base
  return `${base}?v=${Math.floor(versionTs)}`
}

function eventTypeFromScenario(scenarioId: string | undefined, behavior?: string): EventType {
  if (scenarioId?.startsWith('PPE')) return 'PPE_VIOLATION'
  if (scenarioId?.startsWith('PERS') || behavior === 'person') return 'PERSON_DETECTED'
  return 'MACHINE_STOPPED'
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
  }
  return { lat: 0, lng: 0 }
}

export function mapBackendEventToPatrolEvent(
  event: BackendViolationEvent,
  backendUrl: string,
): PatrolEvent {
  const cameraId = event.camera_id ?? 'HC-01'
  const { zoneId, zoneName } = zoneMetaForCamera(cameraId)
  const helmetNum = cameraId.replace('HC-', '')
  const ts = event.confirmed_at ?? event.created_at
  const workerLabel = event.worker_name?.trim() || event.worker_id?.trim() || 'Người chưa xác định'
  const eventType = eventTypeFromScenario(event.scenario_id, event.behavior)
  const objectId = event.worker_id?.trim()
    || event.dedup_key?.split('|').pop()
    || event.id.slice(0, 8)

  return {
    id: event.id,
    type: eventType,
    cameraId,
    cameraName: `Helmet ${helmetNum}`,
    zoneId,
    zoneName,
    objectId,
    objectLabel: workerLabel,
    violationLabel: event.scenario_name ?? event.scenario_id ?? (
      eventType === 'PERSON_DETECTED' ? 'Phát hiện người' : 'Vi phạm PPE'
    ),
    startedAt: unixToIso(event.created_at),
    lockedAt: unixToIso(ts),
    endedAt: null,
    durationSeconds: null,
    status: 'LOCKED',
    confidence: Number(event.confidence ?? 0),
    gps: resolveEventGps(event, cameraId),
    snapshotUrl: buildSnapshotUrl(backendUrl, event.id, ts),
  }
}

export async function fetchPatrolHelmetLiveEvents(
  cameraId = 'HC-01',
  backendUrl = getVmsBackendUrl(),
): Promise<PatrolEvent[]> {
  if (!backendUrl || !isPatrolHelmetCameraId(cameraId)) return []
  const hasPatrol = await probePatrolApi(backendUrl)
  let rows: BackendViolationEvent[] = []
  if (hasPatrol) {
    const date = todayIsoDate()
    const params = new URLSearchParams({ limit: '500', date })
    const res = await fetch(
      `${patrolApiBase(backendUrl)}/patrol/${cameraId}/events?${params.toString()}`,
      { headers: TUNNEL_HEADERS, mode: 'cors' },
    )
    if (res.ok) {
      rows = ((await res.json()) as BackendViolationEvent[]).filter(isPatrolModuleBackendEvent)
    }
  } else {
    rows = await fetchLegacyHelmetEvents(cameraId, backendUrl)
  }
  return rows.map(row => mapBackendEventToPatrolEvent(row, backendUrl))
}

export async function fetchPatrolHelmetAggregateLiveEvents(
  cameraIds: readonly string[],
  backendUrl = getVmsBackendUrl(),
): Promise<PatrolEvent[]> {
  const ids = cameraIds.filter(isPatrolHelmetCameraId)
  if (!backendUrl || ids.length === 0) return []

  const hasPatrol = await probePatrolApi(backendUrl)
  let rows: BackendViolationEvent[] = []

  if (hasPatrol) {
    const date = todayIsoDate()
    const params = new URLSearchParams({
      cameras: ids.join(','),
      date,
      limit: '500',
    })
    const res = await fetch(
      `${patrolApiBase(backendUrl)}/patrol/events?${params.toString()}`,
      { headers: TUNNEL_HEADERS, mode: 'cors' },
    )
    if (res.ok) {
      rows = ((await res.json()) as BackendViolationEvent[]).filter(isPatrolModuleBackendEvent)
    }
  } else {
    rows = await fetchLegacyAggregateEvents(ids, backendUrl)
  }

  return rows.map(row => mapBackendEventToPatrolEvent(row, backendUrl))
}
