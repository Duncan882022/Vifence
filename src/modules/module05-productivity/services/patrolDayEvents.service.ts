/**
 * Sự kiện tuần tra đọc thẳng từ SQLite của server.
 *
 * Thay cho đường cũ gom sự kiện ATLĐ rồi lọc lại nhiều lớp ở trình duyệt. Ở
 * đây một người là một thẻ mỗi ngày — đó là khoá chính của bảng, không phải
 * kết quả của một vòng gộp trùng chạy sau, nên hai máy khác nhau không thể
 * nhìn ra hai con số khác nhau.
 */
import { fetchPatrol, patrolBackendBase, signPatrolSnapshot } from '@/services/patrolApiClient'

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
  /** face_quality×2 + confidence — tab Người cần ≥ ngưỡng mặt rõ. */
  snapshotScore?: number
}

export interface PatrolDayObject {
  objId: string
  firstSeen: number
  lastSeen: number
  snapshotUrl?: string
  /** face_quality×2 + confidence — mặt rõ thì không thuộc tab Đối tượng. */
  snapshotScore?: number
}

export interface PatrolAppearanceSegment {
  id?: number
  cameraId: string
  zoneId: string | null
  startedAt: number
  endedAt: number
  gpsLat?: number | null
  gpsLng?: number | null
  gpsLatEnd?: number | null
  gpsLngEnd?: number | null
  presenceSeq?: number
  sourceCameras?: string[]
  snapshotUrl?: string
}

export interface PatrolDayPresence {
  id: number
  subjectId: string
  cameraId: string
  zoneId: string | null
  startedAt: number
  endedAt: number
  gpsLat: number | null
  gpsLng: number | null
  /** GPS cuối lượt — cập nhật khi presence upsert (giống sự kiện). */
  gpsLatEnd?: number | null
  gpsLngEnd?: number | null
  presenceSeq: number
  tier: 'person' | 'identity' | 'object'
  displayName: string
  sourceCameras: string[]
}

export interface PatrolDayStats {
  date: string
  workersStandard: number
  personCount: number
  identityCount: number
  encountersStandard: number
  unassignedObservations: number
}

export interface PatrolDayBundle {
  date: string
  stats: PatrolDayStats
  persons: PatrolDayPerson[]
  objects: PatrolDayObject[]
  presences: PatrolDayPresence[]
}

function backendBase(): string {
  return patrolBackendBase()
}

async function getJson<T>(path: string, timeoutMs = 12_000): Promise<T | null> {
  return fetchPatrol<T>(path, undefined, timeoutMs)
}

async function snapshotUrl(
  path: string | null | undefined,
  lastSeen?: number,
  cacheKey?: string | number,
): Promise<string | undefined> {
  const p = (path ?? '').trim()
  if (!p) return undefined
  const signed = await signPatrolSnapshot(p)
  const bustToken = cacheKey != null && String(cacheKey).length > 0
    ? String(cacheKey)
    : lastSeen && lastSeen > 0
      ? String(Math.floor(lastSeen))
      : ''
  const bust = bustToken ? `&v=${encodeURIComponent(bustToken)}` : ''
  if (signed) return `${signed}${bust}`
  const base = backendBase()
  if (!base) return undefined
  return `${base}/patrol/snapshot?path=${encodeURIComponent(p)}${bust}`
}

export async function fetchPatrolSubjectAppearances(
  subjectId: string,
  date?: string,
): Promise<PatrolAppearanceSegment[]> {
  const params = new URLSearchParams({ subject_id: subjectId })
  if (date) params.set('date', date)
  const data = await getJson<{
    ok: boolean
    segments: Record<string, unknown>[]
  }>(`/patrol/day/appearances?${params.toString()}`)
  if (!data?.ok) return []

  const rows = data.segments ?? []
  return Promise.all(rows.map(async r => ({
    id: r.id != null ? Number(r.id) : undefined,
    cameraId: String(r.camera_id ?? ''),
    zoneId: r.zone_id ? String(r.zone_id) : null,
    startedAt: Number(r.started_at ?? 0),
    endedAt: Number(r.ended_at ?? 0),
    gpsLat: r.gps_lat != null ? Number(r.gps_lat) : null,
    gpsLng: r.gps_lng != null ? Number(r.gps_lng) : null,
    gpsLatEnd: r.gps_lat_end != null ? Number(r.gps_lat_end) : null,
    gpsLngEnd: r.gps_lng_end != null ? Number(r.gps_lng_end) : null,
    presenceSeq: r.presence_seq != null ? Number(r.presence_seq) : undefined,
    sourceCameras: Array.isArray(r.source_cameras)
      ? (r.source_cameras as string[])
      : undefined,
    snapshotUrl: await snapshotUrl(
      r.snapshot_path as string | null,
      Number(r.ended_at ?? 0),
      r.id != null
        ? `ap-${Number(r.id)}`
        : `ap-${Number(r.started_at ?? 0)}-${Number(r.ended_at ?? 0)}`,
    ),
  })))
}

export async function fetchPatrolDayBundle(date?: string): Promise<PatrolDayBundle | null> {
  const query = date ? `?date=${encodeURIComponent(date)}` : ''
  const data = await getJson<{
    ok: boolean
    date: string
    stats: Record<string, unknown>
    events: Record<string, unknown>[]
    objects: Record<string, unknown>[]
    presences: Record<string, unknown>[]
  }>(`/patrol/day/bundle${query}`)
  if (!data?.ok) return null

  const persons = await Promise.all((data.events ?? []).map(async row => ({
    persId: String(row.pers_id ?? ''),
    status: (row.status === 'identified' ? 'identified' : 'person') as PatrolPersonStatus,
    idenCode: row.iden_code ? String(row.iden_code) : null,
    displayName: String(row.display_name ?? row.pers_id ?? ''),
    fullName: row.full_name ? String(row.full_name) : null,
    employeeCode: row.employee_code ? String(row.employee_code) : null,
    contractor: row.contractor ? String(row.contractor) : null,
    firstSeen: Number(row.first_seen ?? 0),
    lastSeen: Number(row.last_seen ?? 0),
    snapshotUrl: await snapshotUrl(row.snapshot_path as string | null, Number(row.last_seen ?? 0)),
    snapshotScore: Number(row.snapshot_score ?? 0),
  })))

  const objects = await Promise.all((data.objects ?? []).map(async row => ({
    objId: String(row.obj_id ?? ''),
    firstSeen: Number(row.first_seen ?? 0),
    lastSeen: Number(row.last_seen ?? 0),
    snapshotUrl: await snapshotUrl(row.snapshot_path as string | null, Number(row.last_seen ?? 0)),
    snapshotScore: Number(row.snapshot_score ?? 0),
  })))

  const presences = (data.presences ?? []).map(row => ({
    id: Number(row.id ?? 0),
    subjectId: String(row.subject_id ?? ''),
    cameraId: String(row.camera_id ?? ''),
    zoneId: row.zone_id ? String(row.zone_id) : null,
    startedAt: Number(row.started_at ?? 0),
    endedAt: Number(row.ended_at ?? 0),
    gpsLat: row.gps_lat != null ? Number(row.gps_lat) : null,
    gpsLng: row.gps_lng != null ? Number(row.gps_lng) : null,
    gpsLatEnd: row.gps_lat_end != null ? Number(row.gps_lat_end) : null,
    gpsLngEnd: row.gps_lng_end != null ? Number(row.gps_lng_end) : null,
    presenceSeq: Number(row.presence_seq ?? 1),
    tier: (row.tier === 'identity' ? 'identity' : row.tier === 'object' ? 'object' : 'person') as PatrolDayPresence['tier'],
    displayName: String(row.display_name ?? row.subject_id ?? ''),
    sourceCameras: Array.isArray(row.source_cameras)
      ? (row.source_cameras as string[])
      : row.camera_id
        ? [String(row.camera_id)]
        : [],
  }))

  const statsRow = data.stats ?? {}
  const stats: PatrolDayStats = {
    date: data.date,
    workersStandard: Number(statsRow.workers_standard ?? 0),
    personCount: Number(statsRow.person_count ?? 0),
    identityCount: Number(statsRow.identity_count ?? 0),
    encountersStandard: Number(statsRow.encounters_standard ?? 0),
    unassignedObservations: Number(statsRow.unassigned_observations ?? 0),
  }

  return {
    date: data.date,
    stats,
    persons,
    objects,
    presences,
  }
}

export function formatAppearanceTimeRange(startSec: number, _endSec?: number): string {
  const d = new Date(startSec * 1000)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

/** Gán tên cho một Người → Định danh. Ảnh kèm theo được lưu làm khuôn mặt. */
export async function identifyPatrolPerson(input: {
  persId: string
  fullName: string
  employeeCode: string
  contractor?: string
  imageB64?: string | null
}): Promise<{ ok: boolean; error?: string; displayName?: string; idenCode?: string }> {
  if (!backendBase()) return { ok: false, error: 'Chưa cấu hình URL backend.' }

  try {
    const data = await fetchPatrol<{
      ok: boolean
      error?: string
      person?: { display_name?: string; iden_code?: string }
    }>(
      `/patrol/persons/${encodeURIComponent(input.persId)}/identify`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: input.fullName,
          employee_code: input.employeeCode,
          contractor: input.contractor ?? '',
          image_b64: input.imageB64 ?? undefined,
        }),
      },
      20_000,
    )
    if (!data) return { ok: false, error: 'Không kết nối được backend.' }
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
