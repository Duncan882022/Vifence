/**
 * Sự kiện tuần tra đọc thẳng từ SQLite của server.
 *
 * Thay cho đường cũ gom sự kiện ATLĐ rồi lọc lại nhiều lớp ở trình duyệt. Ở
 * đây một người là một thẻ mỗi ngày — đó là khoá chính của bảng, không phải
 * kết quả của một vòng gộp trùng chạy sau, nên hai máy khác nhau không thể
 * nhìn ra hai con số khác nhau.
 */
import { getVmsBackendUrl } from '@/modules/module03-safety/services/vmsDetections.service'
import { getMobileAiBackendUrl } from '@/modules/module02-training/services/mobileAiBackend.service'

export type PatrolPersonStatus = 'person' | 'identified'

export interface PatrolDayPerson {
  persId: string
  status: PatrolPersonStatus
  idenCode: string | null
  displayName: string
  fullName: string | null
  employeeCode: string | null
  contractor: string | null
  firstSeen: number
  lastSeen: number
  snapshotUrl?: string
}

export interface PatrolDayObject {
  objId: string
  firstSeen: number
  lastSeen: number
  snapshotUrl?: string
}

export interface PatrolAppearanceSegment {
  cameraId: string
  zoneId: string | null
  startedAt: number
  endedAt: number
}

function backendBase(): string {
  return getVmsBackendUrl() || getMobileAiBackendUrl() || ''
}

async function getJson<T>(path: string, timeoutMs = 12_000): Promise<T | null> {
  const base = backendBase()
  if (!base) return null
  try {
    const res = await fetch(`${base}${path}`, {
      method: 'GET',
      mode: 'cors',
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

function snapshotUrl(path: string | null | undefined): string | undefined {
  const p = (path ?? '').trim()
  if (!p) return undefined
  const base = backendBase()
  if (!base) return undefined
  return `${base}/patrol/snapshot?path=${encodeURIComponent(p)}`
}

export async function fetchPatrolDayPersons(date?: string): Promise<PatrolDayPerson[]> {
  const query = date ? `?date=${encodeURIComponent(date)}` : ''
  const data = await getJson<{ ok: boolean; items: Record<string, unknown>[] }>(
    `/patrol/day/events${query}`,
  )
  if (!data?.ok) return []
  return (data.items ?? []).map(row => ({
    persId: String(row.pers_id ?? ''),
    status: (row.status === 'identified' ? 'identified' : 'person') as PatrolPersonStatus,
    idenCode: row.iden_code ? String(row.iden_code) : null,
    displayName: String(row.display_name ?? row.pers_id ?? ''),
    fullName: row.full_name ? String(row.full_name) : null,
    employeeCode: row.employee_code ? String(row.employee_code) : null,
    contractor: row.contractor ? String(row.contractor) : null,
    firstSeen: Number(row.first_seen ?? 0),
    lastSeen: Number(row.last_seen ?? 0),
    snapshotUrl: snapshotUrl(row.snapshot_path as string | null),
  }))
}

export async function fetchPatrolDayObjects(date?: string): Promise<PatrolDayObject[]> {
  const query = date ? `?date=${encodeURIComponent(date)}` : ''
  const data = await getJson<{ ok: boolean; items: Record<string, unknown>[] }>(
    `/patrol/day/objects${query}`,
  )
  if (!data?.ok) return []
  return (data.items ?? []).map(row => ({
    objId: String(row.obj_id ?? ''),
    firstSeen: Number(row.first_seen ?? 0),
    lastSeen: Number(row.last_seen ?? 0),
    snapshotUrl: snapshotUrl(row.snapshot_path as string | null),
  }))
}

export async function fetchPatrolSubjectAppearances(
  subjectId: string,
  date?: string,
): Promise<Record<string, PatrolAppearanceSegment[]>> {
  const params = new URLSearchParams({ subject_id: subjectId })
  if (date) params.set('date', date)
  const data = await getJson<{
    ok: boolean
    by_camera: Record<string, Record<string, unknown>[]>
  }>(`/patrol/day/appearances?${params.toString()}`)
  if (!data?.ok) return {}

  const out: Record<string, PatrolAppearanceSegment[]> = {}
  for (const [cameraId, rows] of Object.entries(data.by_camera ?? {})) {
    out[cameraId] = rows.map(r => ({
      cameraId,
      zoneId: r.zone_id ? String(r.zone_id) : null,
      startedAt: Number(r.started_at ?? 0),
      endedAt: Number(r.ended_at ?? 0),
    }))
  }
  return out
}

/** Gán tên cho một Người → Định danh. Ảnh kèm theo được lưu làm khuôn mặt. */
export async function identifyPatrolPerson(input: {
  persId: string
  fullName: string
  employeeCode: string
  contractor?: string
  imageB64?: string | null
}): Promise<{ ok: boolean; error?: string; displayName?: string; idenCode?: string }> {
  const base = backendBase()
  if (!base) return { ok: false, error: 'Chưa cấu hình URL backend.' }

  try {
    const res = await fetch(
      `${base}/patrol/persons/${encodeURIComponent(input.persId)}/identify`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        mode: 'cors',
        body: JSON.stringify({
          full_name: input.fullName,
          employee_code: input.employeeCode,
          contractor: input.contractor ?? '',
          image_b64: input.imageB64 ?? undefined,
        }),
        signal: AbortSignal.timeout(20_000),
      },
    )
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const data = await res.json() as {
      ok: boolean
      error?: string
      person?: { display_name?: string; iden_code?: string }
    }
    if (!data.ok) return { ok: false, error: data.error ?? 'Không rõ nguyên nhân.' }
    return {
      ok: true,
      displayName: data.person?.display_name,
      idenCode: data.person?.iden_code,
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    return { ok: false, error: detail }
  }
}
