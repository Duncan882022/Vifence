import {
  getMobileAiBackendUrl,
  type MobileAiConnectionStatus,
} from '@/modules/module02-training/services/mobileAiBackend.service'
import type { RoadAnalysisRoiZone } from '@/modules/module04-housekeeping/services/roadAnalysisBackend.service'

const TUNNEL_HEADERS: Record<string, string> = {
  'ngrok-skip-browser-warning': 'true',
}

const VMS_CAMERA_IDS = new Set(['A-03', 'A-04', 'HC-01'])

/** Cam VMS luôn vẽ polygon ROI mặc định trên live tile — sau sẽ cấu hình per-cam. */
const VMS_LIVE_ROI_OVERLAY_CAMERAS = new Set(['A-03'])

export function shouldShowVmsLiveRoiOverlay(cameraId: string): boolean {
  return VMS_LIVE_ROI_OVERLAY_CAMERAS.has(cameraId)
}

export interface VmsOverlayDetection {
  behavior: string
  label: string
  confidence: number
  bbox: [number, number, number, number]
  scenario_id?: string
  object_kind?: string
  machine_kind?: string
  distance_m?: number
  nearest_machine?: string
  vehicle_plate?: string
  vehicle_type?: string
  driver_name?: string
  worker_id?: string
  worker_name?: string
  employee_code?: string
  contractor_name?: string
  face_match_confidence?: number
  face_match_source?: string
  track_id?: string
  subject_bbox?: [number, number, number, number]
  related_bbox?: [number, number, number, number]
}

export interface VmsDetectionSnapshot {
  camera_id: string
  width: number
  height: number
  updated_at: number
  /** Vị trí trong file nguồn (giây) lúc AI chạy — đồng bộ overlay live. */
  source_pts_sec?: number
  vms_ready: boolean
  /** Live RTSP còn frame mới — false khi mũ tắt / mất tín hiệu. */
  stream_online?: boolean
  frame_age_sec?: number | null
  detections: VmsOverlayDetection[]
  roi_zones: RoadAnalysisRoiZone[]
  metrics: Record<string, unknown>
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/$/, '')
  if (!trimmed) return ''
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed
  return `https://${trimmed}`
}

/** URL backend VMS — ưu tiên VITE_VMS_BACKEND_URL, fallback mobile AI URL. */
export function getVmsBackendUrl(): string {
  const fromEnv = import.meta.env.VITE_VMS_BACKEND_URL as string | undefined
  if (fromEnv?.trim()) return normalizeBaseUrl(fromEnv)
  return normalizeBaseUrl(getMobileAiBackendUrl())
}

export function isVmsLiveCamera(cameraId: string): boolean {
  return VMS_CAMERA_IDS.has(cameraId) && Boolean(getVmsBackendUrl())
}

export function buildVmsDetectionsUrl(backendUrl: string, cameraId: string): string {
  return `${normalizeBaseUrl(backendUrl)}/stream/${cameraId}/detections`
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

function normalizeBbox(raw: number[] | undefined): [number, number, number, number] | null {
  if (!raw || raw.length < 4) return null
  const [x1, y1, x2, y2] = raw
  if (x2 <= x1 || y2 <= y1) return null
  return [x1, y1, x2, y2]
}

function mapDetection(raw: Record<string, unknown>): VmsOverlayDetection | null {
  const bbox = normalizeBbox(raw.bbox as number[] | undefined)
  if (!bbox) return null
  return {
    behavior: String(raw.behavior ?? ''),
    label: String(raw.label ?? raw.behavior ?? ''),
    confidence: Number(raw.confidence ?? 0),
    bbox,
    scenario_id: raw.scenario_id ? String(raw.scenario_id) : undefined,
    track_id: raw.track_id ? String(raw.track_id) : undefined,
    object_kind: raw.object_kind ? String(raw.object_kind) : undefined,
    machine_kind: raw.machine_kind ? String(raw.machine_kind) : undefined,
    distance_m: raw.distance_m != null ? Number(raw.distance_m) : undefined,
    nearest_machine: raw.nearest_machine ? String(raw.nearest_machine) : undefined,
    vehicle_plate: raw.vehicle_plate ? String(raw.vehicle_plate) : undefined,
    vehicle_type: raw.vehicle_type ? String(raw.vehicle_type) : undefined,
    driver_name: raw.driver_name ? String(raw.driver_name) : undefined,
    worker_id: raw.worker_id ? String(raw.worker_id) : undefined,
    worker_name: raw.worker_name ? String(raw.worker_name) : undefined,
    employee_code: raw.employee_code ? String(raw.employee_code) : undefined,
    contractor_name: raw.contractor_name ? String(raw.contractor_name) : undefined,
    face_match_confidence:
      raw.face_match_confidence != null ? Number(raw.face_match_confidence) : undefined,
    face_match_source: raw.face_match_source ? String(raw.face_match_source) : undefined,
    subject_bbox: normalizeBbox(raw.subject_bbox as number[] | undefined) ?? undefined,
    related_bbox: normalizeBbox(raw.related_bbox as number[] | undefined) ?? undefined,
  }
}

export async function fetchVmsDetections(
  backendUrl: string,
  cameraId: string,
): Promise<VmsDetectionSnapshot> {
  const res = await fetchWithTimeout(buildVmsDetectionsUrl(backendUrl, cameraId), {
    method: 'GET',
    headers: TUNNEL_HEADERS,
    mode: 'cors',
  }, 15000)

  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const data = await res.json() as {
    type?: string
    camera_id?: string
    width?: number
    height?: number
    updated_at?: number
    source_pts_sec?: number
    vms_ready?: boolean
    stream_online?: boolean
    frame_age_sec?: number | null
    detections?: Record<string, unknown>[]
    roi_zones?: RoadAnalysisRoiZone[]
    metrics?: Record<string, unknown>
  }

  const detections = (data.detections ?? [])
    .map(row => mapDetection(row))
    .filter((row): row is VmsOverlayDetection => Boolean(row))

  return {
    camera_id: data.camera_id ?? cameraId,
    width: Number(data.width ?? 0),
    height: Number(data.height ?? 0),
    updated_at: Number(data.updated_at ?? 0),
    source_pts_sec: data.source_pts_sec != null ? Number(data.source_pts_sec) : undefined,
    vms_ready: Boolean(data.vms_ready),
    stream_online: data.stream_online,
    frame_age_sec: data.frame_age_sec ?? null,
    detections,
    roi_zones: data.roi_zones ?? [],
    metrics: data.metrics ?? {},
  }
}

export interface VmsDetectionPollerOptions {
  cameraId: string
  backendUrl?: string
  intervalMs?: number
  onSnapshot: (snapshot: VmsDetectionSnapshot) => void
  onStatusChange: (status: MobileAiConnectionStatus, message?: string) => void
}

export function createVmsDetectionPoller(options: VmsDetectionPollerOptions): { stop: () => void } {
  const {
    cameraId,
    backendUrl = getVmsBackendUrl(),
    intervalMs = 450,
    onSnapshot,
    onStatusChange,
  } = options

  if (!normalizeBaseUrl(backendUrl)) {
    onStatusChange('error', 'Chưa cấu hình URL backend VMS.')
    return { stop: () => {} }
  }

  let stopped = false
  let inFlight = false
  let timerId = 0
  let connectedOnce = false

  const schedule = (delay = intervalMs) => {
    if (stopped) return
    timerId = window.setTimeout(() => { void tick() }, delay)
  }

  const tick = async () => {
    if (stopped || inFlight) {
      schedule(800)
      return
    }
    if (typeof document !== 'undefined' && document.hidden) {
      schedule(1800)
      return
    }

    if (!connectedOnce) onStatusChange('connecting')
    inFlight = true
    try {
      const snapshot = await fetchVmsDetections(backendUrl, cameraId)
      if (stopped) return
      connectedOnce = true
      onStatusChange('connected')
      onSnapshot(snapshot)
      schedule(intervalMs)
    } catch (err) {
      if (stopped) return
      const msg = err instanceof Error ? err.message : 'Không kết nối được VMS detections.'
      onStatusChange('error', msg)
      schedule(3500)
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
