import { getVmsBackendUrl } from '@/modules/module03-safety/services/vmsDetections.service'
import { getMobileAiBackendUrl } from '@/modules/module02-training/services/mobileAiBackend.service'

export interface PatrolWorkerPerson {
  pers_id: string
  status: 'person' | 'identified'
  iden_code: string | null
  display_name: string
  full_name: string | null
  employee_code: string | null
  contractor: string | null
  origin: string | null
  first_seen: number | null
  last_seen: number | null
  identified_at: number | null
  face_count?: number
  face_enrollment_complete?: boolean
}

export interface PatrolScanPose {
  slot: number
  label: string
  captured: boolean
}

export interface PatrolScanEnrollment {
  pers_id: string
  full_name: string | null
  employee_code: string | null
  contractor: string | null
  status: string | null
  faces_captured: number
  faces_required: number
  complete: boolean
  poses: PatrolScanPose[]
  face_records: number
}

export interface PatrolImportRow {
  full_name: string
  employee_code: string
  contractor?: string
  image_b64?: string
}

export interface PatrolImportResult {
  ok: boolean
  total: number
  success: number
  failed: number
  results: Array<{
    ok: boolean
    employee_code?: string | null
    pers_id?: string
    face_added?: boolean
    error?: string
  }>
}

function backendBase(): string {
  return (getVmsBackendUrl() || getMobileAiBackendUrl() || '').replace(/\/$/, '')
}

async function patrolJson<T>(path: string, init?: RequestInit): Promise<T> {
  const base = backendBase()
  if (!base) throw new Error('Chưa cấu hình URL backend AI.')
  const res = await fetch(`${base}${path}`, {
    ...init,
    mode: 'cors',
    headers: {
      Accept: 'application/json',
      ...(init?.headers ?? {}),
    },
    signal: init?.signal ?? AbortSignal.timeout(20_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<T>
}

export async function pingPatrolProfileBackend(): Promise<boolean> {
  const base = backendBase()
  if (!base) return false
  try {
    const res = await fetch(`${base}/patrol/persons`, {
      mode: 'cors',
      signal: AbortSignal.timeout(8_000),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function fetchPatrolWorkerProfiles(
  status?: 'person' | 'identified',
): Promise<PatrolWorkerPerson[]> {
  const q = status ? `?status=${encodeURIComponent(status)}` : ''
  const data = await patrolJson<{ ok: boolean; items: PatrolWorkerPerson[] }>(`/patrol/persons${q}`)
  return data.items ?? []
}

export async function lookupPatrolWorkerByCode(
  employeeCode: string,
): Promise<PatrolWorkerPerson> {
  const params = new URLSearchParams({ employee_code: employeeCode.trim() })
  const data = await patrolJson<{ ok: boolean; error?: string; person?: PatrolWorkerPerson }>(
    `/patrol/persons/lookup?${params.toString()}`,
  )
  if (!data.ok || !data.person) {
    throw new Error(data.error === 'not_found' ? 'Không tìm thấy mã nhân viên.' : (data.error ?? 'Tra cứu thất bại.'))
  }
  return data.person
}

export async function fetchPatrolScanEnrollment(persId: string): Promise<PatrolScanEnrollment> {
  const data = await patrolJson<{ ok: boolean; error?: string; enrollment?: PatrolScanEnrollment }>(
    `/patrol/persons/${encodeURIComponent(persId)}/enrollment`,
  )
  if (!data.ok || !data.enrollment) {
    throw new Error(data.error ?? 'Không tải được trạng thái quét mặt.')
  }
  return data.enrollment
}

export async function importPatrolWorkerProfiles(
  items: PatrolImportRow[],
): Promise<PatrolImportResult> {
  return patrolJson<PatrolImportResult>('/patrol/persons/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  })
}

export async function scanPatrolWorkerFace(
  persId: string,
  imageB64: string,
  poseSlot: number,
): Promise<{ face_added: boolean; enrollment: PatrolScanEnrollment; message?: string }> {
  const data = await patrolJson<{
    ok: boolean
    error?: string
    face_added?: boolean
    enrollment?: PatrolScanEnrollment
    message?: string
  }>(`/patrol/persons/${encodeURIComponent(persId)}/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_b64: imageB64, pose_slot: poseSlot }),
  })
  if (!data.ok || !data.enrollment) {
    const err = data.error === 'no_face_detected'
      ? 'Không phát hiện khuôn mặt — giữ mặt trong khung oval.'
      : (data.error ?? 'Quét mặt thất bại.')
    throw new Error(err)
  }
  return {
    face_added: Boolean(data.face_added),
    enrollment: data.enrollment,
    message: data.message,
  }
}
