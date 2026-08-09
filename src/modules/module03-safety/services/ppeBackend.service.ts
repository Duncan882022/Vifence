import {
  captureVideoFrameBase64,
  getMobileAiBackendUrl,
  scaledAnalyzeDelay,
  type MobileAiConnectionStatus,
} from '@/modules/module02-training/services/mobileAiBackend.service'

const TUNNEL_HEADERS: Record<string, string> = {
  'ngrok-skip-browser-warning': 'true',
}

export type PpeBehavior =
  | 'person'
  | 'hard_hat'
  | 'no_helmet'
  | 'safety_vest'
  | 'no_vest'
  | 'safety_shoes'
  | 'no_shoes'

export interface PpeDetection {
  behavior: PpeBehavior
  label: string
  scenario_id: string
  confidence: number
  bbox: [number, number, number, number]
}

export interface PpeMetrics {
  person_count: number
  ppe_violations: number
}

export interface PpeResult {
  camera_id: string
  width: number
  height: number
  metrics: PpeMetrics
  detections: PpeDetection[]
  events?: Array<{ id: string; behavior: string }>
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/$/, '')
  if (!trimmed) return ''
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed
  return `https://${trimmed}`
}

export function buildPpeAnalyzeUrl(baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl)}/analyze/ppe/frame`
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

export async function postPpeAnalyzeFrame(
  backendUrl: string,
  cameraId: string,
  image: string,
): Promise<PpeResult> {
  const res = await fetchWithTimeout(buildPpeAnalyzeUrl(backendUrl), {
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
    metrics?: PpeMetrics
    detections?: PpeDetection[]
  }

  if (data.type === 'error') throw new Error(data.message ?? 'Lỗi backend.')
  if (data.type !== 'result' || !data.width || !data.height) {
    throw new Error('Phản hồi backend không hợp lệ.')
  }

  return {
    camera_id: data.camera_id ?? cameraId,
    width: data.width,
    height: data.height,
    metrics: data.metrics ?? { person_count: 0, ppe_violations: 0 },
    detections: data.detections ?? [],
  }
}

export interface PpeClientOptions {
  cameraId: string
  backendUrl?: string
  onResult: (result: PpeResult) => void
  onStatusChange: (status: MobileAiConnectionStatus, message?: string) => void
  /** Chỉ gửi frame khi hàm trả true (vd đoạn PPE trong video). */
  shouldAnalyze?: () => boolean
  intervalMs?: number
}

export function createPpeClient(
  video: HTMLVideoElement,
  options: PpeClientOptions,
): { stop: () => void } {
  const {
    cameraId,
    backendUrl = getMobileAiBackendUrl(),
    onResult,
    onStatusChange,
    shouldAnalyze = () => true,
    intervalMs = 1400,
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
    timerId = window.setTimeout(() => { void tick() }, scaledAnalyzeDelay(video, delay))
  }

  const tick = async () => {
    if (stopped || inFlight) {
      scheduleNext(1200)
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
      const result = await postPpeAnalyzeFrame(backendUrl, cameraId, image)
      if (stopped) return
      connectedOnce = true
      onStatusChange('connected')
      onResult(result)
      scheduleNext(1200)
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
