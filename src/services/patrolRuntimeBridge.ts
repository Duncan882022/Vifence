/**
 * Runtime config từ backend — ROI lag, server clock.
 */
import { fetchPatrol } from '@/services/patrolApiClient'

export interface PatrolRuntimeSnapshot {
  liveRoiDelayMs: number
  overlayPipelineLagMs: number
  serverTimeMs: number | null
  subjectAliases: Record<string, string>
  fetchedAtMs: number
}

const DEFAULT_DELAY_MS = 5000

let snapshot: PatrolRuntimeSnapshot = {
  liveRoiDelayMs: DEFAULT_DELAY_MS,
  overlayPipelineLagMs: DEFAULT_DELAY_MS,
  serverTimeMs: null,
  subjectAliases: {},
  fetchedAtMs: 0,
}

const listeners = new Set<() => void>()

function emit() {
  listeners.forEach(fn => fn())
}

export function getPatrolRuntimeSnapshot(): PatrolRuntimeSnapshot {
  return snapshot
}

export function getPatrolLiveRoiDelayMs(): number {
  const ms = snapshot.liveRoiDelayMs
  return Number.isFinite(ms) && ms > 0 ? ms : DEFAULT_DELAY_MS
}

export function subscribePatrolRuntime(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function setPatrolRuntimeFromPayload(raw: Record<string, unknown> | null | undefined): void {
  if (!raw) return
  const delay = Number(raw.live_roi_delay_ms ?? raw.overlay_pipeline_lag_ms ?? DEFAULT_DELAY_MS)
  const aliasesRaw = raw.subject_aliases
  const subjectAliases: Record<string, string> = {}
  if (aliasesRaw && typeof aliasesRaw === 'object' && !Array.isArray(aliasesRaw)) {
    for (const [k, v] of Object.entries(aliasesRaw as Record<string, unknown>)) {
      if (typeof v === 'string' && k.trim()) subjectAliases[k.trim()] = v.trim()
    }
  }
  snapshot = {
    liveRoiDelayMs: Number.isFinite(delay) && delay > 0 ? delay : DEFAULT_DELAY_MS,
    overlayPipelineLagMs: Number.isFinite(delay) && delay > 0 ? delay : DEFAULT_DELAY_MS,
    serverTimeMs: typeof raw.server_time_ms === 'number' ? raw.server_time_ms : null,
    subjectAliases: { ...snapshot.subjectAliases, ...subjectAliases },
    fetchedAtMs: Date.now(),
  }
  emit()
}

export async function fetchPatrolRuntimeConfig(): Promise<PatrolRuntimeSnapshot> {
  const data = await fetchPatrol<Record<string, unknown>>('/patrol/runtime', undefined, 8000)
  if (data?.ok !== false) {
    setPatrolRuntimeFromPayload(data)
  }
  return getPatrolRuntimeSnapshot()
}

/** EMA lệch đồng hồ client ↔ server từ server_emit_ms trên detection snapshot. */
let clientServerSkewMs = 0

export function updatePatrolClientServerSkew(serverEmitMs: number | undefined): void {
  if (serverEmitMs == null || !Number.isFinite(serverEmitMs) || serverEmitMs <= 0) return
  const instant = Date.now() - serverEmitMs
  clientServerSkewMs = clientServerSkewMs * 0.85 + instant * 0.15
}

export function getPatrolClientServerSkewMs(): number {
  return clientServerSkewMs
}

export function resolvePatrolSubjectAlias(subjectId: string): string {
  const key = subjectId.trim()
  if (!key) return subjectId
  return snapshot.subjectAliases[key] ?? key
}
