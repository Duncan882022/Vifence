/**
 * Runtime config từ backend — ROI lag, server clock.
 */
import { fetchPatrol } from '@/services/patrolApiClient'
import { WHEP_DISPLAY_WALLCLOCK_LAG_MS } from '@/modules/module05-productivity/data/patrolHelmetScope'

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

/** EMA độ trễ AI (server_emit − frame_wallclock) — ước lượng at_ms WHEP. */
let aiPipelineLagMs = 400

export function updatePatrolAiPipelineLag(
  frameWallclockMs: number | undefined,
  serverEmitMs: number | undefined,
): void {
  if (
    frameWallclockMs == null
    || serverEmitMs == null
    || !Number.isFinite(frameWallclockMs)
    || !Number.isFinite(serverEmitMs)
    || frameWallclockMs <= 0
    || serverEmitMs <= 0
  ) {
    return
  }
  const instant = serverEmitMs - frameWallclockMs
  if (instant <= 0 || instant > 15_000) return
  aiPipelineLagMs = aiPipelineLagMs * 0.82 + instant * 0.18
}

export function getPatrolAiPipelineLagMs(): number {
  return aiPipelineLagMs
}

/** EMA lag WHEP — học từ frame_wallclock aligned để at_ms khớp overlay. */
let whepDisplayLagEmaMs = WHEP_DISPLAY_WALLCLOCK_LAG_MS

export function updatePatrolWhepDisplayLag(
  frameWallclockMs: number | undefined,
  overlaySync?: string,
): void {
  if (overlaySync !== 'aligned') return
  if (frameWallclockMs == null || !Number.isFinite(frameWallclockMs) || frameWallclockMs <= 0) return
  const instant = Date.now() - getPatrolClientServerSkewMs() - frameWallclockMs
  if (instant < 80 || instant > 4000) return
  whepDisplayLagEmaMs = whepDisplayLagEmaMs * 0.86 + instant * 0.14
}

export function getPatrolWhepDisplayLagMs(): number {
  const aiLag = getPatrolAiPipelineLagMs()
  const blended = Math.max(whepDisplayLagEmaMs, aiLag * 0.85)
  return Math.min(1500, Math.max(220, blended))
}

/** Wallclock khung WHEP ≈ now − playback lag (adaptive) − skew. */
export function getPatrolWhepDisplayWallclockMs(nowMs: number = Date.now()): number {
  return nowMs - getPatrolClientServerSkewMs() - getPatrolWhepDisplayLagMs()
}

/** Playback lag WHEP/WebRTC (~300ms) — tách khỏi buffer HLS 5s. */
export const WHEP_PLAYBACK_LAG_MS = WHEP_DISPLAY_WALLCLOCK_LAG_MS

export function resolvePatrolSubjectAlias(subjectId: string): string {
  const key = subjectId.trim()
  if (!key) return subjectId
  return snapshot.subjectAliases[key] ?? key
}
