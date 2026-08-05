import {
  captureVideoFrameBase64,
  getMobileAiBackendUrl,
  type MobileAiConnectionStatus,
  type MobileAiViolationEvent,
} from '@/modules/module02-training/services/mobileAiBackend.service'

const TUNNEL_HEADERS: Record<string, string> = {
  'ngrok-skip-browser-warning': 'true',
}

export type AtgtBehavior = 'vehicle' | 'speeding' | 'hard_median' | 'soft_median' | 'no_soft_median'

export interface AtgtDetection {
  behavior: AtgtBehavior
  label: string
  confidence: number
  bbox: [number, number, number, number]
  vehiclePlate?: string
  vehicleType?: string
  driverName?: string
}

export interface AtgtResult {
  camera_id: string
  width: number
  height: number
  detections: AtgtDetection[]
  events: MobileAiViolationEvent[]
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/$/, '')
  if (!trimmed) return ''
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed
  return `https://${trimmed}`
}

export function buildAtgtAnalyzeUrl(baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl)}/analyze/atgt/frame`
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

export async function postAtgtAnalyzeFrame(
  backendUrl: string,
  cameraId: string,
  image: string,
): Promise<AtgtResult> {
  const res = await fetchWithTimeout(buildAtgtAnalyzeUrl(backendUrl), {
    method: 'POST',
    headers: {
      ...TUNNEL_HEADERS,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ type: 'frame', camera_id: cameraId, image }),
    mode: 'cors',
  }, 90000)

  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const data = await res.json() as {
    type?: string
    message?: string
    width?: number
    height?: number
    camera_id?: string
    detections?: AtgtDetection[]
    events?: MobileAiViolationEvent[]
  }

  if (data.type === 'error') throw new Error(data.message ?? 'Lỗi backend.')
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

export interface AtgtClientOptions {
  cameraId: string
  backendUrl?: string
  onResult: (result: AtgtResult) => void
  onStatusChange: (status: MobileAiConnectionStatus, message?: string) => void
  shouldAnalyze?: () => boolean
  intervalMs?: number
}

export function createAtgtClient(
  video: HTMLVideoElement,
  options: AtgtClientOptions,
): { stop: () => void } {
  const {
    cameraId,
    backendUrl = getMobileAiBackendUrl(),
    onResult,
    onStatusChange,
    shouldAnalyze = () => true,
    intervalMs = 1200,
  } = options

  if (!normalizeBaseUrl(backendUrl)) {
    onStatusChange('error', 'Chưa cấu hình URL backend AI.')
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
      scheduleNext(800)
      return
    }

    if (typeof document !== 'undefined' && document.hidden) {
      scheduleNext(2000)
      return
    }

    if (!shouldAnalyze()) {
      scheduleNext(600)
      return
    }

    const image = captureVideoFrameBase64(video, 640, 0.72)
    if (!image) {
      scheduleNext(500)
      return
    }

    if (!connectedOnce) onStatusChange('connecting')
    inFlight = true
    try {
      const result = await postAtgtAnalyzeFrame(backendUrl, cameraId, image)
      if (stopped) return
      connectedOnce = true
      onStatusChange('connected')
      onResult(result)
      scheduleNext(intervalMs)
    } catch (err) {
      if (stopped) return
      const msg = err instanceof Error ? err.message : 'Không kết nối được backend.'
      onStatusChange('error', msg)
      scheduleNext(3500)
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

export { getMobileAiBackendUrl }
