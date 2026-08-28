/**
 * GET /patrol/live/bundle — metrics + workforce một round-trip.
 */
import { fetchPatrol } from '@/services/patrolApiClient'
import type { PatrolHelmetAggregateMetricsResponse } from './patrolLiveEvents.service'
import type { WorkforceSnapshot } from '../types/workforceHeatmap'
import { EMPTY_WORKFORCE_SNAPSHOT } from './workforceState.service'

const TUNNEL_HEADERS: Record<string, string> = {
  'ngrok-skip-browser-warning': 'true',
}

export interface PatrolLiveBundleResponse {
  ok: boolean
  metrics: PatrolHelmetAggregateMetricsResponse
  workforce: WorkforceSnapshot
  server_time?: string | null
}

let bundleRouteAvailable: boolean | null = null

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
): Promise<{ metrics: PatrolHelmetAggregateMetricsResponse; workforce: WorkforceSnapshot } | null> {
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
  }
}

/** True sau khi backend đã trả live/bundle thành công ít nhất một lần. */
export function isPatrolLiveBundleAvailable(): boolean {
  return bundleRouteAvailable === true
}
