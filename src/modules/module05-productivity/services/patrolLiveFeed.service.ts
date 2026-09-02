/**
 * Transport live Module 05 — WebSocket push live/bundle, fallback HTTP poll.
 */
import { getPatrolAccessToken } from '@/services/patrolApiClient'
import { setPatrolRuntimeFromPayload } from '@/services/patrolRuntimeBridge'
import { getMobileAiBackendUrl } from '@/modules/module02-training/services/mobileAiBackend.service'
import { getVmsBackendUrl } from '@/modules/module03-safety/services/vmsDetections.service'
import type { PatrolHelmetAggregateMetricsResponse } from '../services/patrolLiveEvents.service'
import { fetchPatrolLiveBundle } from '../services/patrolLiveBundle.service'
import type { WorkforceSnapshot } from '../types/workforceHeatmap'
import { EMPTY_WORKFORCE_SNAPSHOT } from '../services/workforceState.service'

export type PatrolLiveTransport = 'websocket' | 'polling'

export interface PatrolLiveFeedPayload {
  metrics: PatrolHelmetAggregateMetricsResponse
  workforce: WorkforceSnapshot
}

export interface PatrolLiveFeedOptions {
  cameraIds: readonly string[]
  backendUrl?: string
  onPayload: (payload: PatrolLiveFeedPayload) => void
  onTransportChange?: (transport: PatrolLiveTransport) => void
  pollIntervalMs?: number
}

export interface PatrolLiveFeedHandle {
  stop: () => void
}

const WS_STALE_TIMEOUT_MS = 26_000
const WS_RETRY_BASE_MS = 1000
const WS_RETRY_MAX_MS = 8000
const WS_MAX_FAILURES = 3

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/$/, '')
  if (!trimmed) return ''
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed
  return `https://${trimmed}`
}

export function buildPatrolLiveWsUrl(backendUrl: string, cameraIds: readonly string[]): string {
  const base = normalizeBaseUrl(backendUrl)
  if (!base || cameraIds.length === 0) return ''
  const url = new URL(base)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = `${url.pathname.replace(/\/$/, '')}/ws/patrol/live`
  url.searchParams.set('cameras', cameraIds.join(','))
  const token = getPatrolAccessToken()
  if (token) url.searchParams.set('token', token)
  return url.toString()
}

function normalizeWorkforce(raw: Record<string, unknown> | undefined): WorkforceSnapshot {
  if (!raw) return EMPTY_WORKFORCE_SNAPSHOT
  return {
    helmets: (raw.helmets as WorkforceSnapshot['helmets']) ?? {},
    objects: (raw.objects as WorkforceSnapshot['objects']) ?? {},
    zonePopulation: (raw.zonePopulation as WorkforceSnapshot['zonePopulation']) ?? {},
    heatPoints: (raw.heatPoints as WorkforceSnapshot['heatPoints']) ?? [],
    events: (raw.events as WorkforceSnapshot['events']) ?? [],
    server_time: typeof raw.server_time === 'string'
      ? raw.server_time
      : new Date().toISOString(),
  }
}

function normalizeMetrics(
  raw: Record<string, unknown> | undefined,
): PatrolHelmetAggregateMetricsResponse | null {
  if (!raw) return null
  const cameras = Array.isArray(raw.cameras)
    ? raw.cameras.map(row => {
      const r = row as Record<string, unknown>
      return {
        camera_id: String(r.camera_id ?? ''),
        stream_online: Boolean(r.stream_online),
        person_count: Math.max(0, Number(r.person_count ?? 0)),
        identified_workers: Math.max(0, Number(r.identified_workers ?? 0)),
        person_events_today: Math.max(0, Number(r.person_events_today ?? 0)),
        gps_lat: r.gps_lat as number | null | undefined,
        gps_lng: r.gps_lng as number | null | undefined,
      }
    })
    : []
  return {
    cameras,
    backend_reachable: Boolean(raw.backend_reachable),
    stream_online: Boolean(raw.stream_online) || cameras.some(c => c.stream_online),
    person_count: Number(raw.person_count ?? 0),
    identified_workers: Number(raw.identified_workers ?? 0),
    worker_names: Array.isArray(raw.worker_names) ? raw.worker_names as string[] : [],
    person_events_today: Number(raw.person_events_today ?? 0),
  }
}

function parseLiveBundleMessage(data: Record<string, unknown>): PatrolLiveFeedPayload | null {
  if (data.runtime && typeof data.runtime === 'object') {
    setPatrolRuntimeFromPayload(data.runtime as Record<string, unknown>)
  }
  const type = String(data.type ?? '')
  if (type === 'heartbeat') return null
  if (type !== 'live_bundle' && !data.metrics) return null
  const metrics = normalizeMetrics(
    (data.metrics ?? data) as Record<string, unknown>,
  )
  if (!metrics) return null
  return {
    metrics,
    workforce: normalizeWorkforce(data.workforce as Record<string, unknown> | undefined),
  }
}

function isWebSocketSupported(): boolean {
  return typeof WebSocket !== 'undefined'
}

/** WS push live/bundle — fallback HTTP poll khi WS không khả dụng. */
export function createPatrolLiveFeed(options: PatrolLiveFeedOptions): PatrolLiveFeedHandle {
  const {
    cameraIds,
    backendUrl = getMobileAiBackendUrl() || getVmsBackendUrl(),
    onPayload,
    onTransportChange,
    pollIntervalMs = 2500,
  } = options

  let stopped = false
  let socket: WebSocket | null = null
  let pollTimer = 0
  let retryTimer = 0
  let staleTimer = 0
  let failures = 0
  let polling = false

  const clearPoll = () => {
    window.clearTimeout(pollTimer)
    pollTimer = 0
  }

  const clearStaleTimer = () => {
    window.clearTimeout(staleTimer)
    staleTimer = 0
  }

  const armStaleTimer = () => {
    clearStaleTimer()
    staleTimer = window.setTimeout(() => {
      socket?.close()
    }, WS_STALE_TIMEOUT_MS)
  }

  const runPollTick = async () => {
    if (stopped || polling === false) return
    try {
      const bundle = await fetchPatrolLiveBundle(cameraIds)
      if (stopped || !polling) return
      if (bundle) onPayload(bundle)
    } finally {
      if (!stopped && polling) {
        pollTimer = window.setTimeout(() => { void runPollTick() }, pollIntervalMs)
      }
    }
  }

  const startPolling = () => {
    if (stopped || polling) return
    polling = true
    onTransportChange?.('polling')
    void runPollTick()
  }

  const scheduleReconnect = () => {
    if (stopped || polling) return
    failures += 1
    if (failures >= WS_MAX_FAILURES) {
      startPolling()
      return
    }
    const delay = Math.min(WS_RETRY_MAX_MS, WS_RETRY_BASE_MS * 2 ** (failures - 1))
    retryTimer = window.setTimeout(connectWs, delay)
  }

  function connectWs(): void {
    if (stopped || polling) return
    const wsUrl = buildPatrolLiveWsUrl(backendUrl, cameraIds)
    if (!wsUrl) {
      startPolling()
      return
    }

    let ws: WebSocket
    try {
      ws = new WebSocket(wsUrl)
    } catch {
      scheduleReconnect()
      return
    }

    socket = ws

    ws.onopen = () => {
      if (stopped) return
      failures = 0
      onTransportChange?.('websocket')
      armStaleTimer()
    }

    ws.onmessage = event => {
      if (stopped) return
      armStaleTimer()
      try {
        const data = JSON.parse(String(event.data)) as Record<string, unknown>
        const payload = parseLiveBundleMessage(data)
        if (payload) onPayload(payload)
      } catch {
        /* bỏ qua frame hỏng */
      }
    }

    ws.onclose = () => {
      clearStaleTimer()
      socket = null
      if (stopped) return
      scheduleReconnect()
    }
  }

  if (isWebSocketSupported() && normalizeBaseUrl(backendUrl)) {
    connectWs()
  } else {
    startPolling()
  }

  return {
    stop: () => {
      stopped = true
      polling = false
      window.clearTimeout(retryTimer)
      clearPoll()
      clearStaleTimer()
      if (socket) {
        socket.onclose = null
        socket.close()
        socket = null
      }
    },
  }
}
