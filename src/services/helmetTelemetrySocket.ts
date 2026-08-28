/**
 * Telemetry mũ (GPS + heading) → backend qua WebSocket riêng.
 *
 * Tách khỏi luồng video: vị trí vẫn cập nhật khi sóng yếu không đẩy nổi video,
 * và backend broadcast lại nên mọi người xem đều thấy — không phụ thuộc tab nào
 * đang mở camera như luồng cũ.
 *
 * Gửi throttle theo `minIntervalMs` để không spam khi GPS bắn liên tục.
 */

export interface HelmetTelemetrySample {
  lat?: number
  lng?: number
  accuracyM?: number
  heading?: number | null
  /** Wallclock lúc đo — backend dùng để join với detections. */
  wallclockMs: number
}

export interface HelmetTelemetrySenderOptions {
  cameraId: string
  backendUrl: string
  /** JWT patrol — bắt buộc khi backend bật auth. */
  accessToken?: string | null
  onStateChange?: (connected: boolean) => void
  /** Khoảng cách tối thiểu giữa 2 lần gửi (ms). */
  minIntervalMs?: number
}

export interface HelmetTelemetrySender {
  send: (sample: HelmetTelemetrySample) => void
  stop: () => void
  isConnected: () => boolean
}

const RETRY_BASE_MS = 1000
const RETRY_MAX_MS = 15_000

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/$/, '')
  if (!trimmed) return ''
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed
  return `https://${trimmed}`
}

export function buildTelemetryWsUrl(
  backendUrl: string,
  cameraId: string,
  token?: string | null,
): string {
  const base = normalizeBaseUrl(backendUrl)
  if (!base) return ''
  const url = new URL(base)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = `${url.pathname.replace(/\/$/, '')}/ws/helmet/${cameraId}/telemetry`
  if (token?.trim()) url.searchParams.set('token', token.trim())
  return url.toString()
}

export function createHelmetTelemetrySender(
  options: HelmetTelemetrySenderOptions,
): HelmetTelemetrySender {
  const { cameraId, backendUrl, accessToken, onStateChange, minIntervalMs = 1000 } = options

  let socket: WebSocket | null = null
  let stopped = false
  let retryTimer = 0
  let attempts = 0
  let lastSentAt = 0
  /** Mẫu mới nhất chưa gửi — kết nối lại là gửi ngay, không mất vị trí hiện tại. */
  let pending: HelmetTelemetrySample | null = null

  let wsUrl = buildTelemetryWsUrl(backendUrl, cameraId, accessToken)

  const flush = () => {
    if (!pending || socket?.readyState !== WebSocket.OPEN) return
    const sample = pending
    pending = null
    lastSentAt = Date.now()
    try {
      socket.send(JSON.stringify({
        type: 'telemetry',
        camera_id: cameraId,
        lat: sample.lat,
        lng: sample.lng,
        accuracy_m: sample.accuracyM,
        heading: sample.heading ?? undefined,
        wallclock_ms: sample.wallclockMs,
      }))
    } catch {
      // Socket vừa đứt — mẫu kế sẽ gửi lại sau khi reconnect.
    }
  }

  const connect = () => {
    wsUrl = buildTelemetryWsUrl(backendUrl, cameraId, accessToken)
    if (stopped || !wsUrl || typeof WebSocket === 'undefined') return

    let ws: WebSocket
    try {
      ws = new WebSocket(wsUrl)
    } catch {
      scheduleRetry()
      return
    }
    socket = ws

    ws.onopen = () => {
      if (stopped) return
      attempts = 0
      onStateChange?.(true)
      flush()
    }
    ws.onclose = () => {
      socket = null
      onStateChange?.(false)
      if (!stopped) scheduleRetry()
    }
    ws.onerror = () => {
      // onclose xử lý retry.
    }
  }

  function scheduleRetry(): void {
    if (stopped) return
    attempts += 1
    const delay = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** Math.min(attempts - 1, 4))
    retryTimer = window.setTimeout(connect, delay)
  }

  connect()

  return {
    send: (sample: HelmetTelemetrySample) => {
      pending = sample
      if (Date.now() - lastSentAt >= minIntervalMs) flush()
    },
    stop: () => {
      stopped = true
      window.clearTimeout(retryTimer)
      pending = null
      if (socket) {
        socket.onclose = null
        socket.close()
        socket = null
      }
    },
    isConnected: () => socket?.readyState === WebSocket.OPEN,
  }
}
