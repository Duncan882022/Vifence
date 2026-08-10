import {
  buildHealthUrl,
  getMobileAiBackendUrl,
} from '@/modules/module02-training/services/mobileAiBackend.service'

const TUNNEL_HEADERS: Record<string, string> = {
  'ngrok-skip-browser-warning': 'true',
}

export interface WorkerGalleryPose {
  slot: number
  label: string
  captured: boolean
  filename: string
}

export interface WorkerEnrollmentStatus {
  worker_id: string
  worker_name: string | null
  employee_code: string | null
  contractor_name: string | null
  poses_required: number
  poses_captured: number
  complete: boolean
  poses: WorkerGalleryPose[]
}

export interface WorkerGalleryStatusResponse {
  enabled: boolean
  demo_fallback: boolean
  workers_registered: number
  workers_with_face_images: number
  embeddings_loaded: number
  track_cache_size: number
  min_match_confidence: number
  enrollment?: WorkerEnrollmentStatus
  error?: string
}

export interface FacialScannerIdentity {
  userId?: string
  cccd?: string
  workerName: string
  employeeCode: string
  contractorName?: string | null
}

export interface WorkerGalleryEnrollPayload {
  user_id?: string
  cccd?: string
  worker_name: string
  employee_code: string
  contractor_name?: string | null
  image_b64: string
  pose_slot: number
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/$/, '')
  if (!trimmed) return ''
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed
  return `https://${trimmed}`
}

function galleryBaseUrl(): string {
  return normalizeBaseUrl(getMobileAiBackendUrl())
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...TUNNEL_HEADERS,
      ...(init?.headers ?? {}),
    },
    mode: 'cors',
  })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export async function pingWorkerGalleryBackend(): Promise<boolean> {
  const base = galleryBaseUrl()
  if (!base) return false
  try {
    const data = await fetchJson<{ status?: string }>(buildHealthUrl(base))
    return data.status === 'ok'
  } catch {
    return false
  }
}

export async function fetchWorkerGalleryStatus(userId: string): Promise<WorkerGalleryStatusResponse> {
  return fetchWorkerGalleryStatusForIdentity({ userId })
}

export async function fetchWorkerGalleryStatusForIdentity(
  identity: Pick<FacialScannerIdentity, 'userId' | 'cccd'>,
): Promise<WorkerGalleryStatusResponse> {
  const base = galleryBaseUrl()
  if (!base) {
    throw new Error('Chưa cấu hình backend AI (VITE_MOBILE_AI_BACKEND_URL).')
  }
  const params = new URLSearchParams()
  if (identity.userId) params.set('user_id', identity.userId)
  if (identity.cccd) params.set('cccd', identity.cccd)
  return fetchJson(`${base}/workers/gallery/status?${params.toString()}`)
}

function buildEnrollPayload(
  identity: FacialScannerIdentity,
  imageB64: string,
  poseSlot: number,
): WorkerGalleryEnrollPayload {
  return {
    user_id: identity.userId,
    cccd: identity.cccd,
    worker_name: identity.workerName,
    employee_code: identity.employeeCode,
    contractor_name: identity.contractorName,
    image_b64: imageB64,
    pose_slot: poseSlot,
  }
}

export async function enrollWorkerFace(payload: WorkerGalleryEnrollPayload): Promise<WorkerEnrollmentStatus> {
  const base = galleryBaseUrl()
  if (!base) {
    throw new Error('Chưa cấu hình backend AI (VITE_MOBILE_AI_BACKEND_URL).')
  }
  const data = await fetchJson<{ ok: boolean; error?: string; enrollment?: WorkerEnrollmentStatus }>(
    `${base}/workers/gallery/enroll`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    },
  )
  if (!data.ok || !data.enrollment) {
    throw new Error(data.error || 'Không lưu được ảnh khuôn mặt.')
  }
  return data.enrollment
}

export async function enrollWorkerFaceForIdentity(
  identity: FacialScannerIdentity,
  imageB64: string,
  poseSlot: number,
): Promise<WorkerEnrollmentStatus> {
  return enrollWorkerFace(buildEnrollPayload(identity, imageB64, poseSlot))
}
