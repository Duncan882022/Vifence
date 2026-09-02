import {
  getMobileAiBackendUrl,
  type MobileAiConnectionStatus,
} from '@/modules/module02-training/services/mobileAiBackend.service'
import type { RoadAnalysisRoiZone } from '@/modules/module04-housekeeping/services/roadAnalysisBackend.service'
import {
  isLegacyMobileHelmet,
  PATROL_HELMET_IDS,
} from '@/modules/module05-productivity/data/helmetIngest'
import { PATROL_DRONE_IDS } from '@/modules/module05-productivity/data/patrolDrones'

const TUNNEL_HEADERS: Record<string, string> = {
  'ngrok-skip-browser-warning': 'true',
}

const BASE_VMS_CAMERA_IDS = ['A-03', 'A-04', 'HC-01']

/**
 * Camera có VMS worker server-side.
 * Helmet publish qua WHIP cũng chạy trên worker → thêm vào khi MediaMTX sẵn sàng,
 * nhờ đó HC-02 dùng chung đường detections với HC-01 thay vì analyze từng frame.
 */
function resolveVmsCameraIds(): Set<string> {
  const ids = new Set(BASE_VMS_CAMERA_IDS)

  const extra = (import.meta.env.VITE_VMS_CAMERA_IDS as string | undefined)?.trim()
  if (extra) {
    extra.split(',').map(s => s.trim()).filter(Boolean).forEach(id => ids.add(id))
  }

  for (const helmetId of PATROL_HELMET_IDS) {
    if (!isLegacyMobileHelmet(helmetId)) ids.add(helmetId)
  }

  for (const droneId of PATROL_DRONE_IDS) {
    ids.add(droneId)
  }

  return ids
}

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
  /** Tầng định danh đã ổn định phía BE: object | person | identity. */
  tier?: 'object' | 'person' | 'identity'
  /** px/giây trên hệ toạ độ frame AI — FE nội suy ROI giữa hai lần detect. */
  velocity?: [number, number]
  peak_group?: boolean
  peak_group_index?: number
  peak_group_size?: number
}

export interface VmsDetectionSnapshot {
  camera_id: string
  width: number
  height: number
  updated_at: number
  /** Vị trí trong file nguồn (giây) lúc AI chạy — đồng bộ overlay live. */
  source_pts_sec?: number
  /**
   * Wallclock (ms) lúc backend nhận frame từ camera.
   * Khớp với EXT-X-PROGRAM-DATE-TIME của HLS để vẽ bbox đúng khung hình đang phát.
   */
  frame_wallclock_ms?: number
  /** Wallclock (ms) lúc backend gửi payload — hiệu chỉnh skew client/server. */
  server_emit_ms?: number
  /** Gợi ý lag pipeline từ config BE (ms) — thay hằng số FE cứng. */
  overlay_lag_hint_ms?: number
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
  return resolveVmsCameraIds().has(cameraId) && Boolean(getVmsBackendUrl())
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

function isNormalizedBboxCoords(raw: number[]): boolean {
  return Math.max(...raw.slice(0, 4).map(v => Math.abs(v))) <= 1.5
}

function normalizeBbox(
  raw: number[] | undefined,
  frameWidth = 0,
  frameHeight = 0,
): [number, number, number, number] | null {
  if (!raw || raw.length < 4) return null
  let [x1, y1, x2, y2] = raw
  if (frameWidth > 0 && frameHeight > 0 && isNormalizedBboxCoords(raw)) {
    x1 *= frameWidth
    y1 *= frameHeight
    x2 *= frameWidth
    y2 *= frameHeight
  }
  if (x2 <= x1 || y2 <= y1) return null
  return [x1, y1, x2, y2]
}

const TIER_VALUES = new Set(['object', 'person', 'identity'])

function normalizeTier(raw: unknown): VmsOverlayDetection['tier'] {
  const value = typeof raw === 'string' ? raw.trim() : ''
  return TIER_VALUES.has(value) ? (value as VmsOverlayDetection['tier']) : undefined
}

function normalizeVelocity(raw: number[] | undefined): [number, number] | undefined {
  if (!raw || raw.length < 2) return undefined
  const [vx, vy] = raw
  if (!Number.isFinite(vx) || !Number.isFinite(vy)) return undefined
  return [Number(vx), Number(vy)]
}

function mapDetection(
  raw: Record<string, unknown>,
  frameWidth: number,
  frameHeight: number,
): VmsOverlayDetection | null {
  const bbox = normalizeBbox(raw.bbox as number[] | undefined, frameWidth, frameHeight)
  if (!bbox) return null
  const workerId = raw.worker_id
    ? String(raw.worker_id)
    : raw.id
      ? String(raw.id)
      : undefined
  return {
    behavior: String(raw.behavior ?? 'person'),
    label: String(raw.label ?? raw.behavior ?? 'person'),
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
    worker_id: workerId,
    worker_name: raw.worker_name ? String(raw.worker_name) : workerId,
    employee_code: raw.employee_code ? String(raw.employee_code) : undefined,
    contractor_name: raw.contractor_name ? String(raw.contractor_name) : undefined,
    face_match_confidence:
      raw.face_match_confidence != null ? Number(raw.face_match_confidence) : undefined,
    face_match_source: raw.face_match_source ? String(raw.face_match_source) : undefined,
    subject_bbox: normalizeBbox(raw.subject_bbox as number[] | undefined, frameWidth, frameHeight) ?? undefined,
    related_bbox: normalizeBbox(raw.related_bbox as number[] | undefined, frameWidth, frameHeight) ?? undefined,
    tier: normalizeTier(raw.tier),
    velocity: normalizeVelocity(raw.velocity as number[] | undefined),
    peak_group: raw.peak_group === true,
    peak_group_index: raw.peak_group_index != null ? Number(raw.peak_group_index) : undefined,
    peak_group_size: raw.peak_group_size != null ? Number(raw.peak_group_size) : undefined,
  }
}

interface RawVmsDetectionPayload {
  type?: string
  camera_id?: string
  width?: number
  height?: number
  updated_at?: number
  source_pts_sec?: number
  frame_wallclock_ms?: number
  server_emit_ms?: number
  overlay_lag_hint_ms?: number
  vms_ready?: boolean
  stream_online?: boolean
  frame_age_sec?: number | null
  reset_state?: boolean
  status?: string
  total_workers?: number
  detections?: Record<string, unknown>[]
  roi_zones?: RoadAnalysisRoiZone[]
  metrics?: Record<string, unknown>
}

/** Chuẩn hoá payload backend — dùng chung cho HTTP poll và WebSocket push. */
export function normalizeVmsDetectionSnapshot(
  raw: unknown,
  cameraId: string,
): VmsDetectionSnapshot {
  const data = (raw ?? {}) as RawVmsDetectionPayload
  const frameWidth = Number(data.width ?? 0)
  const frameHeight = Number(data.height ?? 0)

  const detections = (data.detections ?? [])
    .map(row => mapDetection(row, frameWidth, frameHeight))
    .filter((row): row is VmsOverlayDetection => Boolean(row))

  return {
    camera_id: data.camera_id ?? cameraId,
    width: frameWidth,
    height: frameHeight,
    updated_at: Number(data.updated_at ?? 0),
    source_pts_sec: data.source_pts_sec != null ? Number(data.source_pts_sec) : undefined,
    frame_wallclock_ms: data.frame_wallclock_ms != null
      ? Number(data.frame_wallclock_ms)
      : undefined,
    server_emit_ms: data.server_emit_ms != null ? Number(data.server_emit_ms) : undefined,
    overlay_lag_hint_ms: data.overlay_lag_hint_ms != null
      ? Number(data.overlay_lag_hint_ms)
      : undefined,
    vms_ready: Boolean(data.vms_ready),
    stream_online: data.stream_online,
    frame_age_sec: data.frame_age_sec ?? null,
    detections,
    roi_zones: data.roi_zones ?? [],
    metrics: data.metrics ?? {},
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

  return normalizeVmsDetectionSnapshot(await res.json(), cameraId)
}

export interface VmsDetectionPollerOptions {
  cameraId: string
  backendUrl?: string
  intervalMs?: number
  onSnapshot: (snapshot: VmsDetectionSnapshot) => void
  onBeforeSnapshot?: () => void
  onStatusChange: (status: MobileAiConnectionStatus, message?: string) => void
}

export function createVmsDetectionPoller(options: VmsDetectionPollerOptions): { stop: () => void } {
  const {
    cameraId,
    backendUrl = getVmsBackendUrl(),
    intervalMs = 450,
    onSnapshot,
    onBeforeSnapshot,
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
      onBeforeSnapshot?.()
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
