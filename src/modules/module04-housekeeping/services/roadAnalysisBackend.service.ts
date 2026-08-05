import {
  captureVideoFrameBase64,
  getMobileAiBackendUrl,
  type MobileAiConnectionStatus,
} from '@/modules/module02-training/services/mobileAiBackend.service'

const TUNNEL_HEADERS: Record<string, string> = {
  'ngrok-skip-browser-warning': 'true',
}

export type RoadAnalysisBehavior =
  | 'mud'
  | 'water'
  | 'object'
  | 'unknown'
  | 'mesh_missing'
  | 'mesh_torn'
  | 'mesh_dirty'

export interface RoadAnalysisDetection {
  behavior: RoadAnalysisBehavior
  label: string
  scenario_id: string
  confidence: number
  bbox: [number, number, number, number]
  area_percent?: number
}

export interface RoadAnalysisRoiZone {
  id: string
  label: string
  type: 'ROAD' | 'BUFFER' | 'STORAGE' | 'MESH'
  polygon: Array<{ x: number; y: number }>
}

export interface RoadAnalysisMetrics {
  mud_percent: number
  water_percent: number
  object_count: number
}

export interface RoadAnalysisResult {
  camera_id: string
  width: number
  height: number
  roi_zones: RoadAnalysisRoiZone[]
  metrics: RoadAnalysisMetrics
  detections: RoadAnalysisDetection[]
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/$/, '')
  if (!trimmed) return ''
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed
  return `https://${trimmed}`
}

export function buildRoadAnalyzeUrl(baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl)}/analyze/road/frame`
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

export async function postRoadAnalyzeFrame(
  backendUrl: string,
  cameraId: string,
  image: string,
): Promise<RoadAnalysisResult> {
  const res = await fetchWithTimeout(buildRoadAnalyzeUrl(backendUrl), {
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
    roi_zones?: RoadAnalysisRoiZone[]
    metrics?: RoadAnalysisMetrics
    detections?: RoadAnalysisDetection[]
  }

  if (data.type === 'error') throw new Error(data.message ?? 'Lỗi backend.')
  if (data.type !== 'result' || !data.width || !data.height) {
    throw new Error('Phản hồi backend không hợp lệ.')
  }

  return {
    camera_id: data.camera_id ?? cameraId,
    width: data.width,
    height: data.height,
    roi_zones: data.roi_zones ?? [],
    metrics: data.metrics ?? { mud_percent: 0, water_percent: 0, object_count: 0 },
    detections: data.detections ?? [],
  }
}

export interface RoadAnalysisClientOptions {
  cameraId: string
  backendUrl?: string
  onResult: (result: RoadAnalysisResult) => void
  onStatusChange: (status: MobileAiConnectionStatus, message?: string) => void
  shouldAnalyze?: () => boolean
  intervalMs?: number
}

export function createRoadAnalysisClient(
  video: HTMLVideoElement,
  options: RoadAnalysisClientOptions,
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
      scheduleNext(900)
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
      const result = await postRoadAnalyzeFrame(backendUrl, cameraId, image)
      if (stopped) return
      connectedOnce = true
      onStatusChange('connected')
      onResult(result)
      scheduleNext(900)
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
