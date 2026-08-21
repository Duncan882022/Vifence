import {
  captureCameraAnalyzeFrame,
  getMobileAiBackendUrl,
  scaledAnalyzeDelay,
  type MobileAiConnectionStatus,
  type MobileAiViolationEvent,
} from '@/modules/module02-training/services/mobileAiBackend.service'

const TUNNEL_HEADERS: Record<string, string> = {
  'ngrok-skip-browser-warning': 'true',
}

export type PcccBehavior = 'smoking' | 'fire'

export interface PcccDetection {
  behavior: PcccBehavior
  label: string
  confidence: number
  bbox: [number, number, number, number]
  scenario_id?: string
  worker_name?: string
}

export interface PcccResult {
  camera_id: string
  width: number
  height: number
  detections: PcccDetection[]
  events: MobileAiViolationEvent[]
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/$/, '')
  if (!trimmed) return ''
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed
  return `https://${trimmed}`
}

export function buildPcccAnalyzeUrl(baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl)}/analyze/pccc/frame`
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

export async function postPcccAnalyzeFrame(
  backendUrl: string,
  cameraId: string,
  image: string,
): Promise<PcccResult> {
  const res = await fetchWithTimeout(buildPcccAnalyzeUrl(backendUrl), {
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
    detections?: PcccDetection[]
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

export interface PcccClientOptions {
  cameraId: string
  backendUrl?: string
  onResult: (result: PcccResult) => void
  onStatusChange: (status: MobileAiConnectionStatus, message?: string) => void
  shouldAnalyze?: () => boolean
  intervalMs?: number
}

export function createPcccClient(
  video: HTMLVideoElement,
  options: PcccClientOptions,
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
    timerId = window.setTimeout(() => { void tick() }, scaledAnalyzeDelay(video, delay))
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

    const image = captureCameraAnalyzeFrame(video, cameraId, 640, 0.72)
    if (!image) {
      scheduleNext(500)
      return
    }

    if (!connectedOnce) onStatusChange('connecting')
    inFlight = true
    try {
      const result = await postPcccAnalyzeFrame(backendUrl, cameraId, image)
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
