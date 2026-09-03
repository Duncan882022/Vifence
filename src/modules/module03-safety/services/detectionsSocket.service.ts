/**
 * Transport detections — WebSocket push, tự rơi về HTTP poll khi WS không dùng được.
 *
 * Poll 450ms có hai nhược điểm: bbox nhảy bậc theo nhịp poll, và tải backend tăng
 * tuyến tính theo số người xem. WS push đẩy ngay khi AI chạy xong frame.
 *
 * Fallback là bắt buộc: ngrok free, proxy công ty, hoặc backend cũ chưa có
 * `/ws/stream/{cam}/detections` đều phải chạy được như trước.
 */
import type { MobileAiConnectionStatus } from '@/modules/module02-training/services/mobileAiBackend.service'
import {
  createVmsDetectionPoller,
  getVmsBackendUrl,
  normalizeVmsDetectionSnapshot,
  type VmsDetectionSnapshot,
} from './vmsDetections.service'

export type DetectionsTransport = 'websocket' | 'polling'

export interface DetectionsFeedOptions {
  cameraId: string
  backendUrl?: string
  onSnapshot: (snapshot: VmsDetectionSnapshot) => void
  /** Xóa overlay frame cũ — gọi trước `onSnapshot` mỗi lần nhận detections. */
  onBeforeSnapshot?: () => void
  onStatusChange: (status: MobileAiConnectionStatus, message?: string) => void
  onTransportChange?: (transport: DetectionsTransport) => void
  /** Nhịp poll khi phải fallback (ms). */
  pollIntervalMs?: number
  /**
   * Wallclock (ms) của khung hình đang chiếu. Có hàm này thì backend tự chọn
   * overlay của đúng khung đó; không có thì backend trả bản mới nhất như trước.
   */
  getDisplayWallclockMs?: () => number | null
}

export interface DetectionsFeedHandle {
  stop: () => void
}

/** Bao lâu không có message thì coi WS chết (heartbeat backend 10s). */
const WS_STALE_TIMEOUT_MS = 26_000
/** Backoff kết nối lại WS: 1s → 2s → 4s → 8s, trần 8s. */
const WS_RETRY_BASE_MS = 1000
const WS_RETRY_MAX_MS = 8000
/** Số lần WS thất bại liên tiếp trước khi bỏ hẳn sang poll. */
const WS_MAX_FAILURES = 3
/**
 * Nhịp báo mốc khung hình đang chiếu lên backend.
 *
 * Không cần báo mỗi frame: video chạy 1x nên backend cộng thêm thời gian trôi
 * qua là ra mốc hiện tại. Một giây một lần đủ để bám kịp lúc buffer co giãn.
 */
const WS_CLOCK_SYNC_INTERVAL_MS = 1000

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/$/, '')
  if (!trimmed) return ''
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed
  return `https://${trimmed}`
}

export function buildDetectionsWsUrl(backendUrl: string, cameraId: string): string {
  const base = normalizeBaseUrl(backendUrl)
  if (!base) return ''
  const url = new URL(base)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = `${url.pathname.replace(/\/$/, '')}/ws/stream/${cameraId}/detections`
  return url.toString()
}

function isWebSocketSupported(): boolean {
  return typeof WebSocket !== 'undefined'
}

/**
 * Mở feed detections. Ưu tiên WS; nếu WS lỗi liên tiếp thì chuyển hẳn sang poll
 * và không thử lại nữa (tránh nhấp nháy transport giữa phiên xem).
 */
export function createDetectionsFeed(options: DetectionsFeedOptions): DetectionsFeedHandle {
  const {
    cameraId,
    backendUrl = getVmsBackendUrl(),
    onSnapshot,
    onBeforeSnapshot,
    onStatusChange,
    onTransportChange,
    pollIntervalMs = 450,
    getDisplayWallclockMs,
  } = options

  let stopped = false
  let socket: WebSocket | null = null
  let poller: { stop: () => void } | null = null
  let retryTimer = 0
  let staleTimer = 0
  let clockTimer = 0
  let failures = 0
  let connectedOnce = false

  const startPolling = (reason?: string) => {
    if (stopped || poller) return
    onTransportChange?.('polling')
    if (reason) onStatusChange('connecting', reason)
    poller = createVmsDetectionPoller({
      cameraId,
      backendUrl,
      intervalMs: pollIntervalMs,
      onSnapshot,
      onBeforeSnapshot,
      onStatusChange,
      getDisplayWallclockMs,
    })
  }

  const clearClockTimer = () => {
    window.clearInterval(clockTimer)
    clockTimer = 0
  }

  const startClockSync = (ws: WebSocket) => {
    if (!getDisplayWallclockMs) return
    clearClockTimer()

    const push = () => {
      if (stopped || ws.readyState !== WebSocket.OPEN) return
      const atMs = getDisplayWallclockMs()
      try {
        ws.send(JSON.stringify({
          type: 'sync',
          at_ms: atMs != null && Number.isFinite(atMs) && atMs > 0 ? Math.round(atMs) : null,
        }))
      } catch {
        // Kết nối đang đóng — onclose lo phần retry.
      }
    }

    push()
    clockTimer = window.setInterval(push, WS_CLOCK_SYNC_INTERVAL_MS)
  }

  const clearStaleTimer = () => {
    window.clearTimeout(staleTimer)
    staleTimer = 0
  }

  const armStaleTimer = () => {
    clearStaleTimer()
    staleTimer = window.setTimeout(() => {
      // Không nhận được gì kể cả heartbeat — coi như đứt, đóng để retry.
      socket?.close()
    }, WS_STALE_TIMEOUT_MS)
  }

  const scheduleReconnect = () => {
    if (stopped || poller) return
    failures += 1
    if (failures >= WS_MAX_FAILURES) {
      startPolling('WebSocket không khả dụng — chuyển sang polling.')
      return
    }
    const delay = Math.min(WS_RETRY_MAX_MS, WS_RETRY_BASE_MS * 2 ** (failures - 1))
    retryTimer = window.setTimeout(connectWs, delay)
  }

  function connectWs(): void {
    if (stopped || poller) return

    const wsUrl = buildDetectionsWsUrl(backendUrl, cameraId)
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
    if (!connectedOnce) onStatusChange('connecting')

    ws.onopen = () => {
      if (stopped) return
      failures = 0
      connectedOnce = true
      onTransportChange?.('websocket')
      onStatusChange('connected')
      armStaleTimer()
      startClockSync(ws)
    }

    ws.onmessage = event => {
      if (stopped) return
      armStaleTimer()
      try {
        const data = JSON.parse(String(event.data)) as Record<string, unknown>
        const type = String(data.type ?? '')

        if (type === 'error') {
          // Backend không có worker cho camera này — poll cũng vô nghĩa, nhưng
          // giữ hành vi cũ để FE hiện đúng trạng thái.
          onStatusChange('error', String(data.message ?? 'Camera không có VMS worker.'))
          ws.close()
          return
        }
        if (type === 'heartbeat') return
        if (type !== 'detections') return

        // Backend Module 05 gửi reset_state — xóa overlay frame trước (tránh box ma).
        if (data.reset_state !== false) {
          onBeforeSnapshot?.()
        }
        onSnapshot(normalizeVmsDetectionSnapshot(data, cameraId))
        onStatusChange('connected')
      } catch {
        // Message hỏng — bỏ qua, chờ frame kế.
      }
    }

    ws.onerror = () => {
      // onclose sẽ chạy ngay sau — xử lý retry ở đó.
    }

    ws.onclose = () => {
      clearStaleTimer()
      clearClockTimer()
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
      window.clearTimeout(retryTimer)
      clearStaleTimer()
      clearClockTimer()
      if (socket) {
        socket.onclose = null
        socket.close()
        socket = null
      }
      poller?.stop()
      poller = null
    },
  }
}
