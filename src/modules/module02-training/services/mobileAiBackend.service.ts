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
  /** HC-* — track ổn định phía BE, FE khoá ROI theo id này thay vì đoán bằng IoU. */
  track_id?: string
  /** BE đã thấy mặt rõ trong bbox — quyết định tab Người / ghi sự kiện. */
  face_eligible?: boolean
  /** Thẻ vốn là obj-*, lên hạng khi bắt mặt — nhãn ROI thêm ↑. */
  promoted_from_object?: boolean
  /** Mã obj-* gốc — ROI hiển thị mã thay nhãn chung Người. */
  promoted_from?: string[]
  /** Tầng đã ổn định của track: object | person | identity. */
  tier?: 'object' | 'person' | 'identity'
  /** px/giây theo hệ toạ độ frame AI — mồi vận tốc cho ROI khỏi trễ một nhịp. */
  velocity?: [number, number]
  /** Peak time — gom nhóm 1 obj; ROI vẫn đánh số từng người. */
  peak_group?: boolean
  peak_group_index?: number
  peak_group_size?: number
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
  /** Patrol flycam — `flight_mode` aerial | proximity (tầm cao / tầm thấp). */
  metrics?: Record<string, unknown>
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
  const externalSignal = init.signal
  if (typeof AbortSignal !== 'undefined' && 'timeout' in AbortSignal && !externalSignal) {
    return fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  }
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  const onExternalAbort = () => controller.abort()
  externalSignal?.addEventListener('abort', onExternalAbort)
  return fetch(url, { ...init, signal: controller.signal }).finally(() => {
    window.clearTimeout(timer)
    externalSignal?.removeEventListener('abort', onExternalAbort)
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

/** MOB-* → hút thuốc/cháy; HC-* patrol → person-only (nhanh, bỏ PPE models). */
export function resolveMobileAnalyzeMode(cameraId: string): MobileAnalyzeMode {
  if (cameraId.startsWith('HC-')) return 'person'
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
  timeoutMs = 90000,
  signal?: AbortSignal,
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
    signal,
  }, timeoutMs)
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
  let abortController: AbortController | null = null
  let pendingAfterInFlight = false
  let lastRoundTripMs = intervalMs
  const isPatrolHelmet = cameraId.startsWith('HC-')

  const scheduleNext = (delay = intervalMs) => {
    if (stopped) return
    timerId = window.setTimeout(() => { void tick() }, scaledAnalyzeDelay(video, delay))
  }

  const tick = async () => {
    if (stopped) return

    // HC-*: chờ response thay vì abort liên tục — tránh mất bbox khi backend chậm.
    if (inFlight && isPatrolHelmet) {
      pendingAfterInFlight = true
      scheduleNext(60)
      return
    } else if (inFlight) {
      scheduleNext(400)
      return
    }
    pendingAfterInFlight = false

    if (typeof document !== 'undefined' && document.hidden) {
      scheduleNext(2000)
      return
    }

    if (!shouldAnalyze()) {
      scheduleNext(600)
      return
    }

    const isHelmet = cameraId.startsWith('HC-')
    const image = captureCameraAnalyzeFrame(video, cameraId, 640, isHelmet ? 0.68 : 0.72)
    if (!image) {
      scheduleNext(500)
      return
    }

    if (!connectedOnce) onStatusChange('connecting')
    inFlight = true
    abortController = typeof AbortController !== 'undefined' ? new AbortController() : null
    const gps = getGps?.() ?? null
    const heading = getHeading?.() ?? null
    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
    try {
      const result = await postAnalyzeFrame(
        backendUrl,
        cameraId,
        image,
        analyzeMode,
        gps,
        heading,
        isPatrolHelmet ? 45000 : 90000,
        abortController?.signal,
      )
      if (stopped) return
      connectedOnce = true
      onStatusChange('connected')
      onResult(result)
      const finishedAt = typeof performance !== 'undefined' ? performance.now() : Date.now()
      lastRoundTripMs = Math.max(intervalMs, finishedAt - startedAt)
      const adaptiveGap = isPatrolHelmet
        ? Math.min(120, Math.max(24, Math.round(lastRoundTripMs * 0.12)))
        : (analyzeMode === 'person' || intervalMs < 350 ? 40 : 120)
      scheduleNext(adaptiveGap)
    } catch (err) {
      if (stopped) return
      if (err instanceof DOMException && err.name === 'AbortError') {
        scheduleNext(60)
        return
      }
      const msg = err instanceof Error ? err.message : 'Không kết nối được backend.'
      onStatusChange('error', msg)
      scheduleNext(3000)
    } finally {
      inFlight = false
      if (pendingAfterInFlight && !stopped) {
        pendingAfterInFlight = false
        scheduleNext(20)
      }
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
