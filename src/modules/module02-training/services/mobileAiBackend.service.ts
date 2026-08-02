/** URL backend AI local (ngrok/Cloudflare Tunnel) — lưu runtime, không hardcode lúc build. */
const STORAGE_KEY = 'vifence_mobile_ai_backend_url'

export interface MobileAiDetection {
  behavior: 'smoking' | 'fire'
  label: string
  confidence: number
  bbox: [number, number, number, number]
}

export interface MobileAiViolationEvent {
  id: string
  behavior: string
  scenario_id: string
  scenario_name: string
  violation_type: string
  group: string
  confidence: number
  bbox: number[]
  created_at: number
  snapshot_file?: string | null
}

export interface MobileAiAnalyzeResult {
  camera_id: string
  width: number
  height: number
  detections: MobileAiDetection[]
  events: MobileAiViolationEvent[]
}

export function getMobileAiBackendUrl(): string {
  if (typeof window === 'undefined') return ''
  return localStorage.getItem(STORAGE_KEY)?.trim() ?? ''
}

export function setMobileAiBackendUrl(url: string): void {
  if (typeof window === 'undefined') return
  const trimmed = url.trim()
  if (trimmed) localStorage.setItem(STORAGE_KEY, trimmed)
  else localStorage.removeItem(STORAGE_KEY)
}

/** Chuyển URL ngrok/https thành WebSocket /ws/analyze */
export function buildAnalyzeWsUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/$/, '')
  if (!trimmed) return ''

  if (trimmed.startsWith('ws://') || trimmed.startsWith('wss://')) {
    return trimmed.includes('/ws/') ? trimmed : `${trimmed}/ws/analyze`
  }

  const withProto = trimmed.startsWith('http://') || trimmed.startsWith('https://')
    ? trimmed
    : `https://${trimmed}`

  const url = new URL(withProto)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = '/ws/analyze'
  url.search = ''
  url.hash = ''
  return url.toString()
}

export function buildHealthUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/$/, '')
  if (!trimmed) return ''
  const withProto = trimmed.startsWith('http://') || trimmed.startsWith('https://')
    ? trimmed
    : `https://${trimmed}`
  return `${withProto.replace(/\/$/, '')}/health`
}

export async function pingMobileAiBackend(baseUrl: string): Promise<boolean> {
  const healthUrl = buildHealthUrl(baseUrl)
  if (!healthUrl) return false
  try {
    const res = await fetch(healthUrl, { method: 'GET', signal: AbortSignal.timeout(8000) })
    if (!res.ok) return false
    const data = await res.json() as { status?: string }
    return data.status === 'ok'
  } catch {
    return false
  }
}

/** Chụp 1 frame từ video, resize nếu quá lớn, trả base64 JPEG (không prefix data:). */
export function captureVideoFrameBase64(
  video: HTMLVideoElement,
  maxWidth = 1280,
  quality = 0.72,
): string | null {
  const w = video.videoWidth
  const h = video.videoHeight
  if (!w || !h) return null

  const scale = w > maxWidth ? maxWidth / w : 1
  const cw = Math.round(w * scale)
  const ch = Math.round(h * scale)

  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  ctx.drawImage(video, 0, 0, cw, ch)
  const dataUrl = canvas.toDataURL('image/jpeg', quality)
  const comma = dataUrl.indexOf(',')
  return comma >= 0 ? dataUrl.slice(comma + 1) : null
}

export type MobileAiConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error'

export interface MobileAiAnalyzeClientOptions {
  cameraId: string
  backendUrl: string
  onResult: (result: MobileAiAnalyzeResult) => void
  onStatusChange: (status: MobileAiConnectionStatus, message?: string) => void
  intervalMs?: number
}

/** WebSocket client: gửi frame định kỳ, nhận detections từ backend local. */
export function createMobileAiAnalyzeClient(
  video: HTMLVideoElement,
  options: MobileAiAnalyzeClientOptions,
): { stop: () => void } {
  const {
    cameraId,
    backendUrl,
    onResult,
    onStatusChange,
    intervalMs = 1800,
  } = options

  const wsUrl = buildAnalyzeWsUrl(backendUrl)
  if (!wsUrl) {
    onStatusChange('error', 'Chưa cấu hình URL backend.')
    return { stop: () => {} }
  }

  let ws: WebSocket | null = null
  let stopped = false
  let sending = false
  let timerId = 0

  const scheduleNext = (delay = intervalMs) => {
    if (stopped) return
    timerId = window.setTimeout(() => { void sendFrame() }, delay)
  }

  const sendFrame = async () => {
    if (stopped || !ws || ws.readyState !== WebSocket.OPEN || sending) {
      scheduleNext()
      return
    }
    const image = captureVideoFrameBase64(video)
    if (!image) {
      scheduleNext(400)
      return
    }
    sending = true
    try {
      ws.send(JSON.stringify({ type: 'frame', camera_id: cameraId, image }))
    } catch {
      onStatusChange('error', 'Mất kết nối backend.')
    } finally {
      sending = false
    }
  }

  onStatusChange('connecting')
  ws = new WebSocket(wsUrl)

  ws.onopen = () => {
    if (stopped) return
    onStatusChange('connected')
    void sendFrame()
  }

  ws.onmessage = (ev) => {
    if (stopped) return
    try {
      const data = JSON.parse(String(ev.data)) as {
        type?: string
        message?: string
        width?: number
        height?: number
        detections?: MobileAiDetection[]
        events?: MobileAiViolationEvent[]
        camera_id?: string
      }
      if (data.type === 'error') {
        onStatusChange('error', data.message ?? 'Lỗi backend.')
        return
      }
      if (data.type === 'result' && data.width && data.height) {
        onResult({
          camera_id: data.camera_id ?? cameraId,
          width: data.width,
          height: data.height,
          detections: data.detections ?? [],
          events: data.events ?? [],
        })
        scheduleNext()
      }
    } catch {
      /* ignore malformed */
    }
  }

  ws.onerror = () => {
    if (!stopped) onStatusChange('error', 'Không kết nối được backend.')
  }

  ws.onclose = () => {
    if (!stopped) onStatusChange('error', 'Backend đã ngắt kết nối.')
  }

  return {
    stop: () => {
      stopped = true
      window.clearTimeout(timerId)
      ws?.close()
      ws = null
    },
  }
}
