import { fetchPatrol, patrolBackendBase } from '@/services/patrolApiClient'

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
  pers_id?: string
  session_id?: string
  full_name?: string | null
  employee_code?: string | null
  contractor?: string | null
  status?: string | null
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
  consented_at?: number
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

async function patrolJson<T>(path: string, init?: RequestInit): Promise<T> {
  const data = await fetchPatrol<T>(path, init, 20_000)
  if (data === null) {
    if (!patrolBackendBase()) throw new Error('Chưa cấu hình URL backend AI.')
    throw new Error('Không kết nối được backend patrol.')
  }
  return data
}

export async function pingPatrolProfileBackend(): Promise<boolean> {
  const data = await fetchPatrol<{ ok?: boolean }>('/patrol/persons', undefined, 8_000)
  return data !== null
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

export async function fetchPatrolWorkerProfile(persId: string): Promise<PatrolWorkerPerson> {
  const data = await patrolJson<{ ok: boolean; error?: string; person?: PatrolWorkerPerson }>(
    `/patrol/persons/${encodeURIComponent(persId)}`,
  )
  if (!data.ok || !data.person) {
    throw new Error(data.error === 'not_found' ? 'Không tìm thấy hồ sơ.' : (data.error ?? 'Tải hồ sơ thất bại.'))
  }
  return data.person
}

export async function updatePatrolWorkerProfile(
  persId: string,
  profile: PatrolImportRow,
): Promise<PatrolWorkerPerson> {
  const data = await patrolJson<{ ok: boolean; error?: string; person?: PatrolWorkerPerson }>(
    `/patrol/persons/${encodeURIComponent(persId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: profile.full_name,
        employee_code: profile.employee_code,
        contractor: profile.contractor ?? '',
      }),
    },
  )
  if (!data.ok || !data.person) {
    const err = data.error === 'duplicate_employee_code'
      ? 'Mã nhân viên đã thuộc hồ sơ khác.'
      : data.error === 'missing_fields'
        ? 'Nhập đủ họ tên và mã nhân viên.'
        : data.error === 'not_found'
          ? 'Không tìm thấy hồ sơ.'
          : (data.error ?? 'Cập nhật thất bại.')
    throw new Error(err)
  }
  return data.person
}

export async function deletePatrolWorkerProfile(persId: string): Promise<void> {
  const data = await patrolJson<{ ok: boolean; error?: string }>(
    `/patrol/persons/${encodeURIComponent(persId)}`,
    { method: 'DELETE' },
  )
  if (!data.ok) {
    throw new Error(data.error === 'not_found' ? 'Không tìm thấy hồ sơ.' : (data.error ?? 'Xóa thất bại.'))
  }
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

export async function createPatrolWorkerProfile(
  profile: PatrolImportRow,
): Promise<PatrolWorkerPerson> {
  const data = await patrolJson<{ ok: boolean; error?: string; person?: PatrolWorkerPerson }>(
    '/patrol/persons',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        full_name: profile.full_name,
        employee_code: profile.employee_code,
        contractor: profile.contractor ?? '',
      }),
    },
  )
  if (!data.ok || !data.person) {
    const err = data.error === 'missing_fields'
      ? 'Nhập đủ họ tên và mã nhân viên.'
      : (data.error ?? 'Tạo hồ sơ thất bại.')
    throw new Error(err)
  }
  return data.person
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

export async function createPatrolEnrollSession(): Promise<{
  sessionId: string
  enrollment: PatrolScanEnrollment
}> {
  const data = await patrolJson<{
    ok: boolean
    session_id?: string
    enrollment?: PatrolScanEnrollment
    error?: string
  }>('/patrol/enroll/session', { method: 'POST' })
  if (!data.ok || !data.session_id || !data.enrollment) {
    throw new Error(data.error ?? 'Không tạo được phiên quét.')
  }
  return { sessionId: data.session_id, enrollment: data.enrollment }
}

export async function fetchPatrolEnrollSession(
  sessionId: string,
): Promise<PatrolScanEnrollment> {
  const data = await patrolJson<{
    ok: boolean
    enrollment?: PatrolScanEnrollment
    error?: string
  }>(`/patrol/enroll/${encodeURIComponent(sessionId)}`)
  if (!data.ok || !data.enrollment) {
    throw new Error(data.error === 'session_not_found'
      ? 'Phiên quét đã hết hạn — tải lại trang.'
      : (data.error ?? 'Không tải được trạng thái quét.'))
  }
  return data.enrollment
}

export async function scanPatrolEnrollSessionFace(
  sessionId: string,
  imageB64: string,
  poseSlot: number,
): Promise<{ face_added: boolean; enrollment: PatrolScanEnrollment; message?: string }> {
  const data = await patrolJson<{
    ok: boolean
    error?: string
    face_added?: boolean
    enrollment?: PatrolScanEnrollment
    message?: string
  }>(`/patrol/enroll/${encodeURIComponent(sessionId)}/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_b64: imageB64, pose_slot: poseSlot }),
  })
  if (!data.ok || !data.enrollment) {
    const err = data.error === 'no_face_detected'
      ? 'Không phát hiện khuôn mặt — giữ mặt trong khung oval.'
      : data.error === 'session_not_found'
        ? 'Phiên quét đã hết hạn — tải lại trang.'
        : (data.error ?? 'Quét mặt thất bại.')
    throw new Error(err)
  }
  return {
    face_added: Boolean(data.face_added),
    enrollment: data.enrollment,
    message: data.message,
  }
}

export async function completePatrolEnrollSession(
  sessionId: string,
  profile: PatrolImportRow,
): Promise<{ person: PatrolWorkerPerson; enrollment: PatrolScanEnrollment }> {
  const data = await patrolJson<{
    ok: boolean
    error?: string
    person?: PatrolWorkerPerson
    enrollment?: PatrolScanEnrollment
  }>(`/patrol/enroll/${encodeURIComponent(sessionId)}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      full_name: profile.full_name,
      employee_code: profile.employee_code,
      contractor: profile.contractor ?? '',
      consented_at: profile.consented_at,
    }),
  })
  if (!data.ok || !data.person || !data.enrollment) {
    const err = data.error === 'missing_fields'
      ? 'Nhập đủ họ tên và mã nhân viên.'
      : data.error === 'incomplete_enrollment'
        ? 'Chưa đủ 3 góc mặt — quay lại bước quét.'
        : data.error === 'session_not_found'
          ? 'Phiên quét đã hết hạn — tải lại trang.'
          : (data.error ?? 'Lưu hồ sơ thất bại.')
    throw new Error(err)
  }
  return { person: data.person, enrollment: data.enrollment }
}
