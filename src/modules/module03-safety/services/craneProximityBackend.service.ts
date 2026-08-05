import {
  captureVideoFrameBase64,
  getMobileAiBackendUrl,
  type MobileAiConnectionStatus,
} from '@/modules/module02-training/services/mobileAiBackend.service'

const TUNNEL_HEADERS: Record<string, string> = {
  'ngrok-skip-browser-warning': 'true',
}

export type CraneProximityBehavior = 'person' | 'crane' | 'crane_proximity' | 'unknown'

export interface CraneProximityDetection {
  behavior: CraneProximityBehavior
  label: string
  scenario_id: string
  confidence: number
  bbox: [number, number, number, number]
  distance_m?: number
  machine_kind?: 'crane_green' | 'sany_drill' | 'excavator_orange' | 'tower_crane' | 'machinery_yellow' | 'machinery'
}

export interface CraneProximityRoiZone {
  id: string
  label: string
  type: 'CRANE_BODY' | 'CRANE_WORK'
  polygon: Array<{ x: number; y: number }>
}

export interface CraneProximityMetrics {
  person_count: number
  min_distance_m: number | null
  proximity_violations: number
  proximity_threshold_m: number
}

export interface CraneProximityResult {
  camera_id: string
  width: number
  height: number
  roi_zones: CraneProximityRoiZone[]
  metrics: CraneProximityMetrics
  detections: CraneProximityDetection[]
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/$/, '')
  if (!trimmed) return ''
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed
  return `https://${trimmed}`
}

export function buildCraneAnalyzeUrl(baseUrl: string): string {
  return `${normalizeBaseUrl(baseUrl)}/analyze/crane/frame`
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

export async function postCraneAnalyzeFrame(
  backendUrl: string,
  cameraId: string,
  image: string,
): Promise<CraneProximityResult> {
  const res = await fetchWithTimeout(buildCraneAnalyzeUrl(backendUrl), {
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
    roi_zones?: CraneProximityRoiZone[]
    metrics?: CraneProximityMetrics
    detections?: CraneProximityDetection[]
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
    metrics: data.metrics ?? {
      person_count: 0,
      min_distance_m: null,
      proximity_violations: 0,
      proximity_threshold_m: 1.0,
    },
    detections: data.detections ?? [],
  }
}

export interface CraneProximityClientOptions {
  cameraId: string
  backendUrl?: string
  onResult: (result: CraneProximityResult) => void
  onStatusChange: (status: MobileAiConnectionStatus, message?: string) => void
  /** Chỉ gửi frame khi hàm trả true. */
  shouldAnalyze?: () => boolean
  intervalMs?: number
}

export function createCraneProximityClient(
  video: HTMLVideoElement,
  options: CraneProximityClientOptions,
): { stop: () => void } {
  const {
    cameraId,
    backendUrl = getMobileAiBackendUrl(),
    onResult,
    onStatusChange,
    shouldAnalyze = () => true,
    intervalMs = 1500,
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

    // q≥0.72 — q55 làm lệch màu xanh máy xúc, bbox detect sai vị trí
    const image = captureVideoFrameBase64(video, 640, 0.72)
    if (!image) {
      scheduleNext(500)
      return
    }

    if (!connectedOnce) onStatusChange('connecting')
    inFlight = true
    try {
      const result = await postCraneAnalyzeFrame(backendUrl, cameraId, image)
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
