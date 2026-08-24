/** URL backend AI — cố định qua VITE_MOBILE_AI_BACKEND_URL (.env.local / .env.ghpages). */
import {
  captureCameraAnalyzeFrame,
  scaledAnalyzeDelay,
} from '../utils/videoFrameCapture'

/** @deprecated Chỉ giữ key cho listener storage cũ — URL không còn lưu localStorage. */
export const MOBILE_AI_BACKEND_STORAGE_KEY = 'vifence_mobile_ai_backend_url'

export function notifyMobileAiBackendUrlChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('vifence-mobile-ai-backend-changed'))
}

/** Header tùy chọn khi gọi tunnel cũ (ngrok free). */
const TUNNEL_HEADERS: Record<string, string> = {
  'ngrok-skip-browser-warning': 'true',
}

export interface MobileAiDetection {
  behavior: string
  label: string
  confidence: number
  bbox: [number, number, number, number]
  worker_id?: string
  worker_name?: string
  subject_bbox?: [number, number, number, number]
  /** HC-02 — conf 0.35–0.44, hiển thị bbox vàng (YOLO yếu). */
  weak?: boolean
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
  camera_id?: string
  event_date?: string
  snapshot_file?: string | null
  worker_id?: string | null
  worker_name?: string | null
  track_id?: string | null
  object_id?: string | null
  /** GPS gắn lúc ghi sự kiện (HC-02) */
  gps_lat?: number | null
  gps_lng?: number | null
}

export interface MobileAiAnalyzeResult {
  camera_id: string
  width: number
  height: number
  detections: MobileAiDetection[]
  events: MobileAiViolationEvent[]
}

/** Mặc định backend — bake từ VITE_MOBILE_AI_BACKEND_URL (.env.local / .env.ghpages). */
const ENV_BACKEND_URL = (import.meta.env.VITE_MOBILE_AI_BACKEND_URL as string | undefined)?.trim() ?? ''
const LOCALHOST_FALLBACK = 'http://localhost:8000'

function isRunningOnLocalCms(): boolean {
  if (typeof window === 'undefined') return false
  const h = window.location.hostname
  return h === 'localhost' || h === '127.0.0.1'
}

export function getMobileAiBackendUrl(): string {
  if (typeof window === 'undefined') return ''
  if (ENV_BACKEND_URL) return ENV_BACKEND_URL
  if (isRunningOnLocalCms()) return LOCALHOST_FALLBACK
  return ''
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

export {
  captureCameraAnalyzeFrame,
  captureVideoFrameBase64,
  getVideoAnalyzeIntervalScale,
  invalidateVideoFrameCapture,
  scaledAnalyzeDelay,
  setVideoAnalyzeIntervalScale,
} from '../utils/videoFrameCapture'

export type MobileAiConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error'

export type MobileAnalyzeMode = 'default' | 'ppe' | 'person' | 'pccc' | 'road' | 'crane'

/** MOB-* → hút thuốc/cháy; HC-02 patrol → person-only (nhanh, đủ đếm người). */
export function resolveMobileAnalyzeMode(cameraId: string): MobileAnalyzeMode {
  if (cameraId === 'HC-02') return 'person'
  return 'default'
}

export interface MobileAiAnalyzeClientOptions {
  cameraId: string
  backendUrl: string
  analyzeMode?: MobileAnalyzeMode
  onResult: (result: MobileAiAnalyzeResult) => void
  onStatusChange: (status: MobileAiConnectionStatus, message?: string) => void
  /** GPS gửi kèm mỗi frame (HC-02 patrol). */
  getGps?: () => { lat: number; lng: number } | null
  /** Compass heading 0–360° (IMU / DeviceOrientation) — Workforce Heatmap MD §6. */
  getHeading?: () => number | null
  /** Chỉ gửi frame khi hàm trả true (vd đoạn PCCC trong video). */
  shouldAnalyze?: () => boolean
  intervalMs?: number
}

async function postAnalyzeFrame(
  backendUrl: string,
  cameraId: string,
  image: string,
  analyzeMode: MobileAnalyzeMode = 'default',
  gps?: { lat: number; lng: number } | null,
  heading?: number | null,
): Promise<MobileAiAnalyzeResult> {
  const res = await fetchWithTimeout(buildAnalyzeHttpUrl(backendUrl), {
    method: 'POST',
    headers: {
      ...TUNNEL_HEADERS,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      type: 'frame',
      camera_id: cameraId,
      image,
      ...(analyzeMode !== 'default' ? { mode: analyzeMode } : {}),
      ...(gps ? { gps_lat: gps.lat, gps_lng: gps.lng } : {}),
      ...(heading != null && Number.isFinite(heading) ? { heading } : {}),
    }),
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
    analyzeMode = resolveMobileAnalyzeMode(cameraId),
    onResult,
    onStatusChange,
    getGps,
    getHeading,
    shouldAnalyze = () => true,
    intervalMs = 320,
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
    timerId = window.setTimeout(() => { void tick() }, scaledAnalyzeDelay(video, delay))
  }

  const tick = async () => {
    if (stopped || inFlight) {
      scheduleNext(400)
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

    // HC-* patrol — 480px JPEG 0.65 giảm payload ~40%, rút ngắn round-trip, ROI mượt hơn
    const isHelmet = cameraId.startsWith('HC-')
    const image = captureCameraAnalyzeFrame(video, cameraId, isHelmet ? 480 : 640, isHelmet ? 0.65 : 0.72)
    if (!image) {
      scheduleNext(500)
      return
    }

    if (!connectedOnce) onStatusChange('connecting')
    inFlight = true
    try {
      const result = await postAnalyzeFrame(
        backendUrl,
        cameraId,
        image,
        analyzeMode,
        getGps?.() ?? null,
        getHeading?.() ?? null,
      )
      if (stopped) return
      connectedOnce = true
      onStatusChange('connected')
      onResult(result)
      scheduleNext(analyzeMode === 'person' || intervalMs < 350 ? 40 : 120)
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
