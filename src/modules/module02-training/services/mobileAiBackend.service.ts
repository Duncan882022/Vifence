/** URL backend AI local (ngrok/Cloudflare Tunnel) — lưu runtime, không hardcode lúc build. */
const STORAGE_KEY = 'vifence_mobile_ai_backend_url'

/** Header bắt buộc khi gọi ngrok free từ trình duyệt (WebSocket không gửi được header này). */
const TUNNEL_HEADERS: Record<string, string> = {
  'ngrok-skip-browser-warning': 'true',
}

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

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/$/, '')
  if (!trimmed) return ''
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed
  return `https://${trimmed}`
}

export function buildAnalyzeHttpUrl(baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl)}/analyze/frame`
}

export function buildHealthUrl(baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl)}/health`
}

/** @deprecated Dùng buildAnalyzeHttpUrl — giữ cho tương thích debug */
export function buildAnalyzeWsUrl(baseUrl: string): string {
  const base = normalizeBaseUrl(baseUrl)
  if (!base) return ''
  const url = new URL(base)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = '/ws/analyze'
  return url.toString()
}

function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal) {
    return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  }
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  return fetch(url, { ...init, signal: controller.signal }).finally(() => {
    window.clearTimeout(timer)
  })
}

export async function pingMobileAiBackend(baseUrl: string): Promise<boolean> {
  const healthUrl = buildHealthUrl(baseUrl)
  if (!healthUrl) return false
  try {
    const res = await fetchWithTimeout(healthUrl, {
      method: 'GET',
      headers: TUNNEL_HEADERS,
      mode: 'cors',
    }, 12000)
    if (!res.ok) return false
    const text = await res.text()
    const data = JSON.parse(text) as { status?: string }
    return data.status === 'ok'
  } catch {
    return false
  }
}

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

async function postAnalyzeFrame(
  backendUrl: string,
  cameraId: string,
  image: string,
): Promise<MobileAiAnalyzeResult> {
  const res = await fetchWithTimeout(buildAnalyzeHttpUrl(backendUrl), {
    method: 'POST',
    headers: {
      ...TUNNEL_HEADERS,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'frame', camera_id: cameraId, image }),
    mode: 'cors',
  }, 90000)
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  const data = await res.json() as {
    type?: string
    message?: string
    width?: number
    height?: number
    detections?: MobileAiDetection[]
    events?: MobileAiViolationEvent[]
    camera_id?: string
  }
  if (data.type === 'error') {
    throw new Error(data.message ?? 'Lỗi backend.')
  }
  if (data.type !== 'result' || !data.width || !data.height) {
    throw new Error('Phản hồi backend không hợp lệ.')
  }
  return {
    camera_id: data.camera_id ?? cameraId,
    width: data.width,
    height: data.height,
    detections: data.detections ?? [],
    events: data.events ?? [],
  }
}

/** Gửi frame định kỳ qua HTTP POST (tương thích ngrok free trên mobile). */
export function createMobileAiAnalyzeClient(
  video: HTMLVideoElement,
  options: MobileAiAnalyzeClientOptions,
): { stop: () => void } {
  const {
    cameraId,
    backendUrl,
    onResult,
    onStatusChange,
    intervalMs = 2000,
  } = options

  if (!normalizeBaseUrl(backendUrl)) {
    onStatusChange('error', 'Chưa cấu hình URL backend.')
    return { stop: () => {} }
  }

  let stopped = false
  let inFlight = false
  let timerId = 0
  let connectedOnce = false

  const scheduleNext = (delay = intervalMs) => {
    if (stopped) return
    timerId = window.setTimeout(() => { void tick() }, delay)
  }

  const tick = async () => {
    if (stopped || inFlight) {
      scheduleNext(400)
      return
    }

    const image = captureVideoFrameBase64(video)
    if (!image) {
      scheduleNext(500)
      return
    }

    if (!connectedOnce) onStatusChange('connecting')
    inFlight = true
    try {
      const result = await postAnalyzeFrame(backendUrl, cameraId, image)
      if (stopped) return
      connectedOnce = true
      onStatusChange('connected')
      onResult(result)
      scheduleNext()
    } catch (err) {
      if (stopped) return
      const msg = err instanceof Error ? err.message : 'Không kết nối được backend.'
      onStatusChange('error', msg)
      scheduleNext(3000)
    } finally {
      inFlight = false
    }
  }

  void tick()

  return {
    stop: () => {
      stopped = true
      window.clearTimeout(timerId)
    },
  }
}
