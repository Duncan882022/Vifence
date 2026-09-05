import { getVmsBackendUrl } from '@/modules/module03-safety/services/vmsDetections.service'
import {
  getPatrolHelmetGps,
  getPatrolHelmetGpsLastKnown,
} from '@/services/patrolHelmetGpsBridge'
import { fetchPatrol } from '@/services/patrolApiClient'
import type { EventType, PatrolEvent } from '../data/patrolTypes'
import { PATROL_HELMET_ZONE_ASSIGNMENTS, PATROL_SITE_CENTER } from '../data/patrolSiteMap'
import { resolvePatrolCameraDisplayName } from '../data/patrolCameras'
import { isPatrolMetricsCameraId } from '../data/patrolHelmetScope'
import { unixSecondsToIso, normalizeUnixSeconds } from '../utils/patrolEventsFeed'
import {
  formatPatrolPersonDetectedEvent,
  isPatrolObjectId,
  isPatrolTrackWorkerId,
  patrolWorkforceEventTitle,
} from '../utils/patrolWorkforceEventLabels'
import { isPatrolGalleryWorkerId } from '../utils/patrolIdentityEntity'
import { findPatrolIdentityByWorkerId } from '../services/patrolManualIdentity.service'

const ZONE_LABELS: Record<string, string> = {
  ZONE_1: 'Khu vực 1',
  ZONE_2: 'Khu vực 2',
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
  peak_time_active?: boolean
  gps_lat?: number | null
  gps_lng?: number | null
  heading?: number | null
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
    peak_time_active: Boolean(row.peak_time_active),
    gps_lat: row.gps_lat as number | null | undefined,
    gps_lng: row.gps_lng as number | null | undefined,
    heading: row.heading as number | null | undefined,
  }
}

/** Contabo cũ chưa deploy /patrol/* — cache để tránh spam 404. */
const patrolApiByBase = new Map<string, boolean>()

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

function emptyAggregateFromHealth(
  ids: readonly string[],
  healthMap: Map<string, boolean>,
): PatrolHelmetAggregateMetricsResponse {
  const cameras = ids.map(id => ({
    ...emptyCameraMetrics(id),
    stream_online: healthMap.get(id) ?? false,
  }))
  const anyOnline = cameras.some(row => row.stream_online)
  return {
    cameras,
    backend_reachable: healthMap.size > 0,
    stream_online: anyOnline,
    person_count: 0,
    identified_workers: 0,
    worker_names: [],
    person_events_today: 0,
  }
}

function patrolApiBase(backendUrl: string): string {
  return backendUrl.replace(/\/$/, '')
}

interface HealthCameraRow {
  stream_online?: boolean
}

interface PatrolHealthPayload {
  cameras: Record<string, HealthCameraRow>
  patrolApiOk: boolean
}

function healthMapFromPayload(
  cameraIds: readonly string[],
  cameras: Record<string, HealthCameraRow> | undefined,
): Map<string, boolean> {
  const map = new Map<string, boolean>()
  if (!cameras) return map
  for (const id of cameraIds) {
    const row = cameras[id]
    if (typeof row?.stream_online === 'boolean') {
      map.set(id, row.stream_online)
    }
  }
  return map
}

/** Một lần gọi /health — dùng chung cho probe + stream_online map. */
async function fetchPatrolHealthPayload(
  backendUrl: string,
): Promise<PatrolHealthPayload | null> {
  const base = patrolApiBase(backendUrl)
  try {
    const res = await fetch(`${base}/health`, {
      headers: TUNNEL_HEADERS,
      mode: 'cors',
    })
    if (!res.ok) {
      patrolApiByBase.set(base, false)
      return null
    }
    const data = await res.json() as { cameras?: Record<string, HealthCameraRow> }
    const patrolApiOk = Boolean(data.cameras && typeof data.cameras === 'object')
    patrolApiByBase.set(base, patrolApiOk)
    return {
      cameras: data.cameras ?? {},
      patrolApiOk,
    }
  } catch {
    patrolApiByBase.set(base, false)
    return null
  }
}

async function probePatrolApi(backendUrl: string): Promise<boolean> {
  const base = patrolApiBase(backendUrl)
  const cached = patrolApiByBase.get(base)
  if (cached !== undefined) return cached
  const payload = await fetchPatrolHealthPayload(backendUrl)
  return payload?.patrolApiOk ?? false
}

/** /health công khai — nguồn đúng cho stream_online khi /patrol/metrics cần JWT. */
export async function fetchPatrolHealthStreamMap(
  cameraIds: readonly string[],
  backendUrl: string,
): Promise<Map<string, boolean>> {
  if (!backendUrl || cameraIds.length === 0) return new Map()
  const payload = await fetchPatrolHealthPayload(backendUrl)
  return healthMapFromPayload(cameraIds, payload?.cameras)
}

function applyHealthStreamOnline(
  snapshot: PatrolHelmetAggregateMetricsResponse,
  healthMap: Map<string, boolean>,
  cameraIds: readonly string[],
): PatrolHelmetAggregateMetricsResponse {
  if (healthMap.size === 0) return snapshot

  const byId = new Map(snapshot.cameras.map(row => [row.camera_id, { ...row }]))
  for (const id of cameraIds) {
    const online = healthMap.get(id)
    if (online === undefined) continue
    const prev = byId.get(id) ?? emptyCameraMetrics(id)
    byId.set(id, { ...prev, stream_online: online })
  }

  const cameras = cameraIds.map(id => byId.get(id) ?? emptyCameraMetrics(id))
  const anyOnline = cameras.some(row => row.stream_online)
  return {
    ...snapshot,
    cameras,
    stream_online: anyOnline || snapshot.stream_online,
  }
}

async function fetchPatrolMetricsWithAuth(
  cameraIds: readonly string[],
  backendUrl: string,
  patrolApiReady?: boolean,
): Promise<PatrolHelmetAggregateMetricsResponse | null> {
  const hasPatrol = patrolApiReady ?? await probePatrolApi(backendUrl)
  if (!hasPatrol) return null

  const { ensurePatrolAuth } = await import('@/services/patrolApiClient')
  await ensurePatrolAuth()

  const params = new URLSearchParams({ cameras: cameraIds.join(',') })
  const raw = await fetchPatrol<Record<string, unknown>>(
    `/patrol/metrics?${params.toString()}`,
    { headers: TUNNEL_HEADERS },
  )
  if (!raw) return null

  const cameras = Array.isArray(raw.cameras)
    ? raw.cameras.map(row => normalizeCameraSlice(row as Record<string, unknown>))
    : []
  return normalizeMetricsResponse({ ...raw, cameras }) as unknown as PatrolHelmetAggregateMetricsResponse
}

export async function fetchPatrolHelmetAggregateMetrics(
  cameraIds: readonly string[],
  backendUrl = getVmsBackendUrl(),
): Promise<PatrolHelmetAggregateMetricsResponse | null> {
  const ids = cameraIds.filter(isPatrolMetricsCameraId)
  if (!backendUrl || ids.length === 0) return null

  const healthPayload = await fetchPatrolHealthPayload(backendUrl)
  const healthMap = healthMapFromPayload(ids, healthPayload?.cameras)
  const metrics = healthPayload?.patrolApiOk
    ? await fetchPatrolMetricsWithAuth(ids, backendUrl, true)
    : null

  const base = metrics ?? emptyAggregateFromHealth(ids, healthMap)
  return applyHealthStreamOnline(base, healthMap, ids)
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
  let trackWorkerId = isPatrolTrackWorkerId(workerIdRaw) ? workerIdRaw : undefined
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
    const tkAlias = manual?.objectKeys.find(k => isPatrolTrackWorkerId(k))
    if (tkAlias) trackWorkerId = tkAlias
  }
  const objectLabelHint = isGalleryWorker && workerNameRaw ? workerNameRaw : undefined
  const eventType = eventTypeFromScenario(event.scenario_id, event.behavior)
  const title = patrolWorkforceEventTitle(eventType, objectId, objectLabelHint ?? workerIdRaw, trackWorkerId)
  const versionTs = normalizeUnixSeconds(ts) ?? undefined

  const mapped: PatrolEvent = {
    id: event.id,
    type: eventType,
    cameraId,
    cameraName: resolvePatrolCameraDisplayName(cameraId),
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
