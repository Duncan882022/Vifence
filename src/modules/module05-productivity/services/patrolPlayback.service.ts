/**
 * Playback tuần tra — băng MediaMTX + sự kiện patrol trong ngày.
 *
 *   GET /list?path=hc-02&start=&end=
 *   GET /get?path=hc-02&start=<ISO8601>&duration=<giây>
 */
import dayjs from 'dayjs'
import { formatVnDate, formatVnDateOffsetDays } from '@/utils/vnDateTime'
import type {
  CameraDetection,
  CameraPlaybackRecord,
  CameraDetectionsResponse,
  CameraPlaybackRecordsResponse,
} from '@/types/cameraPlayback'
import type { PatrolEvent } from '../data/patrolTypes'
import { getMediaMtxPlaybackBase, mediaMtxPathForCamera } from '../data/helmetIngest'

/** Một đoạn băng liền mạch do MediaMTX trả về. */
interface MediaMtxSegment {
  start: string
  duration: number
  url?: string
}

/** Đoạn ngắn hơn ngần này thường là mẩu vụn lúc nguồn chập chờn. */
const MIN_SEGMENT_SEC = 3

/** Clip quanh thời điểm sự kiện khi bấm từ tab Sự kiện. */
export const PATROL_EVENT_CLIP_SEC = 30

/** Làm mới timeline khi đang ghi — hiện block xanh mới. */
export const PATROL_PLAYBACK_REFRESH_MS = 20_000

export type PatrolPlaybackFetchError = 'unconfigured' | 'network' | null

function isoDayKey(value: string): string {
  const m = value.match(/^(\d{4}-\d{2}-\d{2})/)
  if (m && value.length <= 10) return m[1]
  if (m && value.includes('T')) return formatVnDate(new Date(value))
  return m?.[1] ?? formatVnDate(new Date(value))
}

function vnDayBounds(startDateParam: string): {
  dayKey: string
  from: Date
  to: Date
  listStart: string
  listEnd: string
} {
  const dayKey = isoDayKey(startDateParam)
  const from = dayjs(`${dayKey}T00:00:00+07:00`).toDate()
  const to = dayjs(`${dayKey}T23:59:59.999+07:00`).toDate()
  return {
    dayKey,
    from,
    to,
    listStart: dayjs(from).toISOString(),
    listEnd: dayjs(to).toISOString(),
  }
}

function buildGetUrl(base: string, path: string, start: string, duration: number): string {
  const params = new URLSearchParams({
    path,
    start,
    duration: String(Math.max(1, Math.round(duration))),
    format: 'mp4',
  })
  return `${base}/get?${params.toString()}`
}

function formatSegmentName(start: string, duration: number): string {
  const d = dayjs(start)
  const hh = d.format('HH')
  const mm = d.format('mm')
  const mins = Math.round(duration / 60)
  return mins >= 1 ? `${hh}:${mm} · ${mins} phút` : `${hh}:${mm}`
}

function eventInstant(ev: PatrolEvent): string {
  return ev.lockedAt || ev.startedAt
}

function patrolEventsForCameraDay(
  events: PatrolEvent[],
  cameraId: string,
  dayKey: string,
): PatrolEvent[] {
  return events.filter(ev => {
    if (ev.cameraId !== cameraId) return false
    return isoDayKey(eventInstant(ev)) === dayKey
  })
}

function patrolEventToRecord(
  ev: PatrolEvent,
  base: string,
  path: string,
): CameraPlaybackRecord {
  const at = eventInstant(ev)
  const started = dayjs(ev.startedAt)
  const ended = ev.endedAt ? dayjs(ev.endedAt) : started.add(PATROL_EVENT_CLIP_SEC, 'second')
  return {
    id: ev.id,
    name: ev.violationLabel?.trim() || ev.objectLabel?.trim() || 'Sự kiện tuần tra',
    startTime: started.toISOString(),
    endTime: ended.toISOString(),
    type: 'event',
    videoUrl: buildGetUrl(base, path, at, PATROL_EVENT_CLIP_SEC),
    seekSec: 0,
    clipDurationSec: PATROL_EVENT_CLIP_SEC,
    thumbnailUrl: ev.snapshotUrl,
  }
}

async function fetchMediaMtxSegments(
  base: string,
  path: string,
  listStart: string,
  listEnd: string,
): Promise<MediaMtxSegment[]> {
  const query = new URLSearchParams({
    path,
    start: listStart,
    end: listEnd,
  })
  const res = await fetch(`${base}/list?${query.toString()}`, {
    method: 'GET',
    mode: 'cors',
    signal: AbortSignal.timeout(12_000),
  })
  // MediaMTX trả 404 + "no recording segments found" khi ngày không có băng — không phải lỗi proxy.
  if (res.status === 404) return []
  if (!res.ok) return []
  const data = (await res.json()) as MediaMtxSegment[] | null
  return Array.isArray(data) ? data : []
}

function segmentsToRecords(
  cameraId: string,
  base: string,
  path: string,
  segments: MediaMtxSegment[],
  from: Date,
  to: Date,
): CameraPlaybackRecord[] {
  const items: CameraPlaybackRecord[] = []
  for (const seg of segments) {
    const startedAt = dayjs(seg.start)
    if (!startedAt.isValid()) continue
    const startDate = startedAt.toDate()
    if (startDate < from || startDate > to) continue
    if (seg.duration < MIN_SEGMENT_SEC) continue

    const endedAt = startedAt.add(seg.duration, 'second')
    items.push({
      id: `${cameraId}-${seg.start}`,
      name: formatSegmentName(seg.start, seg.duration),
      startTime: startedAt.toISOString(),
      endTime: endedAt.toISOString(),
      type: 'continuous',
      videoUrl: buildGetUrl(base, path, seg.start, seg.duration),
    })
  }
  return items
}

export function isPatrolPlaybackConfigured(): boolean {
  return Boolean(getMediaMtxPlaybackBase())
}

export interface PatrolPlaybackFetchers {
  fetchRecords: (
    cameraId: string,
    params: { startDate: string; endDate: string },
  ) => Promise<CameraPlaybackRecordsResponse>
  fetchDetections: (recordId: string) => Promise<CameraDetectionsResponse>
}

/**
 * Factory gắn sự kiện patrol — Module 05 only.
 * `fetchRecords` trả băng liên tục + chấm sự kiện; id sự kiện khớp tab Sự kiện.
 */
export function createPatrolPlaybackFetchers(
  patrolEvents: PatrolEvent[],
): PatrolPlaybackFetchers {
  return {
    fetchRecords: async (cameraId, params) => {
      const base = getMediaMtxPlaybackBase()
      if (!base) return { items: [] }

      const path = mediaMtxPathForCamera(cameraId)
      const { dayKey, from, to, listStart, listEnd } = vnDayBounds(params.startDate)

      const segments = await fetchMediaMtxSegments(base, path, listStart, listEnd)

      const continuous = segmentsToRecords(cameraId, base, path, segments, from, to)
      const eventItems = patrolEventsForCameraDay(patrolEvents, cameraId, dayKey)
        .map(ev => patrolEventToRecord(ev, base, path))

      const items = [...continuous, ...eventItems].sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
      )
      return { items }
    },

    fetchDetections: async (recordId: string) => {
      const ev = patrolEvents.find(e => e.id === recordId)
      if (!ev) return { items: [] }

      const items: CameraDetection[] = [
        {
          id: `${recordId}-patrol`,
          label: ev.type,
          confidenceScore: Math.round((ev.confidence ?? 0) * 100),
          detectionResult: ev.violationLabel || ev.objectLabel,
          createdAt: eventInstant(ev),
        },
      ]
      return { items }
    },
  }
}

/** @deprecated Dùng createPatrolPlaybackFetchers — giữ cho test/import cũ. */
export async function fetchPatrolPlaybackRecords(
  cameraId: string,
  params: { startDate: string; endDate: string },
): Promise<CameraPlaybackRecordsResponse> {
  return createPatrolPlaybackFetchers([]).fetchRecords(cameraId, params)
}

/** @deprecated Dùng createPatrolPlaybackFetchers */
export async function fetchPatrolPlaybackDetections(): Promise<CameraDetectionsResponse> {
  return { items: [] }
}

/** MediaMTX giữ băng 168h — giới hạn chọn ngày playback. */
export const PATROL_PLAYBACK_RETAIN_DAYS = 7

export function getPatrolPlaybackMinDate(): string {
  return formatVnDateOffsetDays(-(PATROL_PLAYBACK_RETAIN_DAYS - 1))
}

/** Ngày lịch VN (0h) — KHÔNG có ca/kíp; không dùng logic 06:00 từ Module 02/03. */
export function getPatrolDefaultPlaybackDate(): string {
  return formatVnDate()
}

function dayHasContinuousSegments(
  segments: MediaMtxSegment[],
  from: Date,
  to: Date,
): boolean {
  return segments.some(seg => {
    const startedAt = dayjs(seg.start)
    if (!startedAt.isValid()) return false
    const startDate = startedAt.toDate()
    if (startDate < from || startDate > to) return false
    return seg.duration >= MIN_SEGMENT_SEC
  })
}

/** Ngày gần nhất (≤ maxDate) có băng liên tục — tránh timeline trống khi hôm nay chưa có ghi. */
export async function findLatestPatrolPlaybackDay(
  cameraId: string,
  maxDate: string,
  minDate: string,
): Promise<string | null> {
  const base = getMediaMtxPlaybackBase()
  if (!base) return null

  const path = mediaMtxPathForCamera(cameraId)
  let cursor = maxDate
  while (cursor >= minDate) {
    const { from, to, listStart, listEnd } = vnDayBounds(`${cursor}T00:00:00+07:00`)
    const segments = await fetchMediaMtxSegments(base, path, listStart, listEnd)
    if (dayHasContinuousSegments(segments, from, to)) return cursor
    cursor = formatVnDateOffsetDays(-1, cursor)
  }
  return null
}
