/**
 * GET /patrol/live/bundle — metrics + workforce một round-trip.
 */
import { fetchPatrol } from '@/services/patrolApiClient'
import type { PatrolHelmetAggregateMetricsResponse, PatrolGpsBundleEntry, PatrolStreamMeta } from './patrolLiveEvents.service'
import type { WorkforceSnapshot } from '../types/workforceHeatmap'
import { EMPTY_WORKFORCE_SNAPSHOT } from './workforceState.service'

const TUNNEL_HEADERS: Record<string, string> = {
  'ngrok-skip-browser-warning': 'true',
}

let bundleRouteAvailable: boolean | null = null

export interface PatrolLiveBundleResponse {
  ok: boolean
  metrics: PatrolHelmetAggregateMetricsResponse
  workforce: WorkforceSnapshot
  stream?: PatrolStreamMeta | null
  gps?: Record<string, PatrolGpsBundleEntry> | null
  server_time?: string | null
}

function normalizeGpsEntry(raw: Record<string, unknown>): PatrolGpsBundleEntry {
  const updatedAt = raw.updated_at
  return {
    gps_lat: raw.gps_lat as number | null | undefined ?? null,
    gps_lng: raw.gps_lng as number | null | undefined ?? null,
    heading: raw.heading as number | null | undefined ?? null,
    updated_at: typeof updatedAt === 'number' && Number.isFinite(updatedAt) ? updatedAt : null,
    datetime_vn: typeof raw.datetime_vn === 'string' ? raw.datetime_vn : null,
  }
}

function normalizeStream(raw: PatrolStreamMeta | undefined | null): PatrolStreamMeta | null {
  if (!raw || typeof raw.datetime_vn !== 'string') return null
  const ts = Number(raw.timestamp)
  return {
    timestamp: Number.isFinite(ts) ? ts : Date.now() / 1000,
    datetime_vn: raw.datetime_vn,
    server_time: typeof raw.server_time === 'string'
      ? raw.server_time
      : new Date().toISOString(),
  }
}

function normalizeGps(
  raw: Record<string, PatrolGpsBundleEntry> | undefined | null,
): Record<string, PatrolGpsBundleEntry> {
  if (!raw) return {}
  return Object.fromEntries(
    Object.entries(raw).map(([cameraId, entry]) => [
      cameraId,
      normalizeGpsEntry(entry as unknown as Record<string, unknown>),
    ]),
  )
}

function normalizeWorkforce(raw: WorkforceSnapshot | undefined): WorkforceSnapshot {
  if (!raw) return EMPTY_WORKFORCE_SNAPSHOT
  return {
    helmets: raw.helmets ?? {},
    objects: raw.objects ?? {},
    zonePopulation: raw.zonePopulation ?? {},
    heatPoints: raw.heatPoints ?? [],
    events: raw.events ?? [],
    server_time: raw.server_time ?? new Date().toISOString(),
  }
}

function normalizeMetrics(
  raw: PatrolHelmetAggregateMetricsResponse | undefined,
): PatrolHelmetAggregateMetricsResponse | null {
  if (!raw) return null
  const cameras = (raw.cameras ?? []).map(row => ({
    ...row,
    stream_online: Boolean(row.stream_online),
    person_count: Math.max(0, Number(row.person_count ?? 0)),
    identified_workers: Math.max(0, Number(row.identified_workers ?? 0)),
    person_events_today: Math.max(0, Number(row.person_events_today ?? 0)),
    heading: row.heading != null && Number.isFinite(Number(row.heading))
      ? Number(row.heading)
      : null,
  }))
  return {
    ...raw,
    cameras,
    stream_online: Boolean(raw.stream_online) || cameras.some(c => c.stream_online),
    backend_reachable: Boolean(raw.backend_reachable),
  }
}

/** Một request thay metrics + workforce riêng. Trả null khi route chưa deploy — fallback poll cũ. */
export async function fetchPatrolLiveBundle(
  cameraIds: readonly string[],
): Promise<{
  metrics: PatrolHelmetAggregateMetricsResponse
  workforce: WorkforceSnapshot
  stream: PatrolStreamMeta | null
  gps: Record<string, PatrolGpsBundleEntry>
} | null> {
  const ids = [...new Set(cameraIds.map(id => id.trim()).filter(Boolean))]
  if (ids.length === 0) return null

  const params = new URLSearchParams({ cameras: ids.join(',') })
  const data = await fetchPatrol<PatrolLiveBundleResponse>(
    `/patrol/live/bundle?${params.toString()}`,
    { headers: TUNNEL_HEADERS },
  )
  if (!data?.ok) return null

  bundleRouteAvailable = true
  const metrics = normalizeMetrics(data.metrics)
  if (!metrics) return null
  return {
    metrics,
    workforce: normalizeWorkforce(data.workforce),
    stream: normalizeStream(data.stream ?? null),
    gps: normalizeGps(data.gps ?? null),
  }
}

/** True sau khi backend đã trả live/bundle thành công ít nhất một lần. */
export function isPatrolLiveBundleAvailable(): boolean {
  return bundleRouteAvailable === true
}
