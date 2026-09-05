/**
 * Sự kiện tuần tra đọc thẳng từ SQLite của server.
 *
 * Thay cho đường cũ gom sự kiện ATLĐ rồi lọc lại nhiều lớp ở trình duyệt. Ở
 * đây một người là một thẻ mỗi ngày — đó là khoá chính của bảng, không phải
 * kết quả của một vòng gộp trùng chạy sau, nên hai máy khác nhau không thể
 * nhìn ra hai con số khác nhau.
 */
import { fetchPatrol, patrolBackendBase, signPatrolSnapshot } from '@/services/patrolApiClient'
import { setPatrolRuntimeFromPayload } from '@/services/patrolRuntimeBridge'

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
  trackWorkerId?: string | null
  gpsLat?: number | null
  gpsLng?: number | null
  /** Các mã `obj-*` đã dồn vào thẻ này khi bắt được mặt. */
  promotedFrom?: string[]
  /** Thời điểm thăng hạng gần nhất (epoch giây). */
  promotedAt?: number | null
}

export interface PatrolDayObject {
  objId: string
  firstSeen: number
  lastSeen: number
  snapshotUrl?: string
  /** face_quality×2 + confidence — mặt rõ thì không thuộc tab Đối tượng. */
  snapshotScore?: number
  gpsLat?: number | null
  gpsLng?: number | null
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
  trackId?: string
  sessionId?: string
  counted?: boolean
  eventPayload?: Record<string, unknown>
  interactions?: Array<{ object_id: string; action: string; timestamp: string }>
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
  trackId?: string
  sessionId?: string
  counted?: boolean
}

export interface PatrolDayStats {
  date: string
  /** Thẻ có snapshot — đồng bộ tab Tất cả. */
  workersStandard: number
  personCount: number
  identityCount: number
  /** Thẻ tab Đối tượng — đồng bộ overlay heatmap (entity có snapshot). */
  objectCount: number
  /** Thẻ Đối tượng đã bắt được mặt và chuyển sang tab Người. */
  promotedObjectCount: number
  /**
   * Lượt gặp Đối tượng — một track từ lúc vào khung tới lúc ra là một lượt.
   *
   * Cố tình lớn hơn số người có mặt: Đối tượng không có tiêu chí trùng khớp
   * nên hai lần nhìn thấy không cách nào biết là một người hay hai. Nhiều mũ
   * cùng thấy một người cũng là nhiều lượt.
   */
  objectEncounterCount?: number
  /** @deprecated Không hiển thị Tier1 — xem popup Lịch sử xuất hiện. */
  encountersStandard: number
  /** Backend alias — trùng objectEncounterCount. */
  unassignedObservations: number
  /** Lượt đóng vì mất tín hiệu — nguồn chập chờn, không nói gì về công trường. */
  sightingsStreamOffline: number
  /** Mọi dòng sổ cái, gồm cả lượt chưa chốt được thẻ. */
  sightingsTotal: number
  /** Track bám được mà không chốt nổi thẻ — phần hệ thống đang bỏ sót. */
  sightingsUnqualified: number
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
  return Promise.all(rows.map(async r => {
    let eventPayload: Record<string, unknown> | undefined
    let interactions: PatrolAppearanceSegment['interactions']
    const rawPayload = r.event_payload_json
    if (typeof rawPayload === 'string' && rawPayload.trim()) {
      try {
        eventPayload = JSON.parse(rawPayload) as Record<string, unknown>
      } catch {
        eventPayload = undefined
      }
    } else if (rawPayload && typeof rawPayload === 'object') {
      eventPayload = rawPayload as Record<string, unknown>
    }
    const rawInteractions = r.interactions_json
    if (typeof rawInteractions === 'string' && rawInteractions.trim()) {
      try {
        interactions = JSON.parse(rawInteractions) as PatrolAppearanceSegment['interactions']
      } catch {
        interactions = undefined
      }
    } else if (Array.isArray(rawInteractions)) {
      interactions = rawInteractions as PatrolAppearanceSegment['interactions']
    }
    return {
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
      trackId: r.track_id ? String(r.track_id) : undefined,
      sessionId: r.session_id ? String(r.session_id) : undefined,
      counted: r.counted != null ? Boolean(Number(r.counted)) : undefined,
      eventPayload,
      interactions,
      snapshotUrl: await snapshotUrl(
        r.snapshot_path as string | null,
        Number(r.ended_at ?? 0),
        r.id != null
          ? `ap-${Number(r.id)}`
          : `ap-${Number(r.started_at ?? 0)}-${Number(r.ended_at ?? 0)}`,
      ),
    }
  }))
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
    runtime?: Record<string, unknown>
    subject_aliases?: Record<string, string>
  }>(`/patrol/day/bundle${query}`)
  if (!data?.ok) return null

  if (data.runtime && typeof data.runtime === 'object') {
    setPatrolRuntimeFromPayload({
      ...(data.runtime as Record<string, unknown>),
      subject_aliases: data.subject_aliases,
    })
  } else if (data.subject_aliases) {
    setPatrolRuntimeFromPayload({ subject_aliases: data.subject_aliases })
  }

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
    trackWorkerId: row.track_worker_id ? String(row.track_worker_id) : null,
    gpsLat: row.gps_lat != null ? Number(row.gps_lat) : null,
    gpsLng: row.gps_lng != null ? Number(row.gps_lng) : null,
    promotedFrom: Array.isArray(row.promoted_from) ? row.promoted_from.map(String) : [],
    promotedAt: row.promoted_at != null ? Number(row.promoted_at) : null,
  })))

  const objects = await Promise.all((data.objects ?? []).map(async row => ({
    objId: String(row.obj_id ?? ''),
    firstSeen: Number(row.first_seen ?? 0),
    lastSeen: Number(row.last_seen ?? 0),
    snapshotUrl: await snapshotUrl(row.snapshot_path as string | null, Number(row.last_seen ?? 0)),
    snapshotScore: Number(row.snapshot_score ?? 0),
    gpsLat: row.gps_lat != null ? Number(row.gps_lat) : null,
    gpsLng: row.gps_lng != null ? Number(row.gps_lng) : null,
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
    trackId: row.track_id ? String(row.track_id) : undefined,
    sessionId: row.session_id ? String(row.session_id) : undefined,
    counted: row.counted != null ? Boolean(Number(row.counted)) : undefined,
  }))

  const statsRow = data.stats ?? {}
  const objectSightings = Number(
    statsRow.object_sighting_count ?? statsRow.unassigned_observations ?? 0,
  )
  const stats: PatrolDayStats = {
    date: data.date,
    workersStandard: Number(statsRow.workers_standard ?? 0),
    personCount: Number(statsRow.person_count ?? 0),
    identityCount: Number(statsRow.identity_count ?? 0),
    objectCount: Number(statsRow.object_card_count ?? 0),
    promotedObjectCount: Number(statsRow.promoted_object_count ?? 0),
    objectEncounterCount: objectSightings,
    encountersStandard: Number(statsRow.encounters_standard ?? 0),
    unassignedObservations: objectSightings,
    sightingsStreamOffline: Number(statsRow.sightings_stream_offline ?? 0),
    sightingsTotal: Number(statsRow.sightings_total ?? 0),
    sightingsUnqualified: Number(statsRow.sightings_unqualified ?? 0),
  }

  return {
    date: data.date,
    stats,
    persons,
    objects,
    presences,
  }
}

export function comparePatrolAppearanceSegments(
  a: PatrolAppearanceSegment,
  b: PatrolAppearanceSegment,
): number {
  const seqA = a.presenceSeq ?? 0
  const seqB = b.presenceSeq ?? 0
  if (seqA !== seqB) return seqB - seqA
  if (a.startedAt !== b.startedAt) return b.startedAt - a.startedAt
  return (b.id ?? 0) - (a.id ?? 0)
}

export function formatAppearanceTimeRange(startSec: number, endSec?: number): string {
  const d = new Date(startSec * 1000)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  if (endSec != null && endSec > startSec + 59) {
    const end = new Date(endSec * 1000)
    const eh = String(end.getHours()).padStart(2, '0')
    const em = String(end.getMinutes()).padStart(2, '0')
    return `${hh}:${mm}:${ss}–${eh}:${em}`
  }
  return `${hh}:${mm}:${ss}`
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
