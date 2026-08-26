/**
 * Playback tuần tra — đọc băng thật từ MediaMTX Playback Server.
 *
 * MediaMTX vẫn ghi băng nguyên bản (fmp4, giữ 7 ngày) từ trước, nhưng không có
 * đường nào đọc ra nên CMS phải dựng danh sách giả từ mock rồi trỏ `videoUrl`
 * vào **luồng live** — bấm xem lại thì thấy hình đang phát trực tiếp.
 *
 * Bật `playback: yes` trong mediamtx.yml là có băng thật, và backend không tốn
 * thêm CPU nào: MediaMTX đọc thẳng file đã ghi, không encode lại.
 *
 *   GET /list?path=hc-02
 *   GET /get?path=hc-02&start=<ISO8601>&duration=<giây>
 */
import type {
  CameraPlaybackRecord,
  CameraPlaybackRecordsResponse,
  CameraDetectionsResponse,
} from '@/types/cameraPlayback'
import { getMediaMtxPlaybackBase, mediaMtxPathForCamera } from '../data/helmetIngest'

/** Một đoạn băng liền mạch do MediaMTX trả về. */
interface MediaMtxSegment {
  start: string
  duration: number
  url?: string
}

/** Đoạn ngắn hơn ngần này thường là mẩu vụn lúc nguồn chập chờn. */
const MIN_SEGMENT_SEC = 5

function isoDateRange(date: string): { from: Date; to: Date } {
  const from = new Date(`${date}T00:00:00+07:00`)
  const to = new Date(`${date}T23:59:59+07:00`)
  return { from, to }
}

function buildGetUrl(base: string, path: string, start: string, duration: number): string {
  const params = new URLSearchParams({
    path,
    start,
    duration: String(Math.max(1, Math.round(duration))),
    format: 'fmp4',
  })
  return `${base}/get?${params.toString()}`
}

function formatSegmentName(start: string, duration: number): string {
  const d = new Date(start)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const mins = Math.round(duration / 60)
  return mins >= 1 ? `${hh}:${mm} · ${mins} phút` : `${hh}:${mm}`
}

export function isPatrolPlaybackConfigured(): boolean {
  return Boolean(getMediaMtxPlaybackBase())
}

/**
 * Danh sách đoạn băng của một camera trong ngày.
 *
 * Chưa cấu hình Playback Server thì trả rỗng chứ không dựng bản ghi giả —
 * "không có băng" là thông tin đúng, còn trỏ vào luồng live thì gây hiểu nhầm.
 */
export async function fetchPatrolPlaybackRecords(
  cameraId: string,
  params: { startDate: string; endDate: string },
): Promise<CameraPlaybackRecordsResponse> {
  const base = getMediaMtxPlaybackBase()
  if (!base) return { items: [] }

  const path = mediaMtxPathForCamera(cameraId)
  const { from, to } = isoDateRange(params.startDate)

  let segments: MediaMtxSegment[]
  try {
    const res = await fetch(`${base}/list?path=${encodeURIComponent(path)}`, {
      method: 'GET',
      mode: 'cors',
      signal: AbortSignal.timeout(12_000),
    })
    if (!res.ok) return { items: [] }
    segments = (await res.json()) as MediaMtxSegment[]
  } catch {
    return { items: [] }
  }

  const items: CameraPlaybackRecord[] = []
  for (const seg of segments) {
    const startedAt = new Date(seg.start)
    if (Number.isNaN(startedAt.getTime())) continue
    if (startedAt < from || startedAt > to) continue
    if (seg.duration < MIN_SEGMENT_SEC) continue

    const endedAt = new Date(startedAt.getTime() + seg.duration * 1000)
    items.push({
      id: `${cameraId}-${seg.start}`,
      name: formatSegmentName(seg.start, seg.duration),
      startTime: startedAt.toISOString(),
      endTime: endedAt.toISOString(),
      type: 'continuous',
      videoUrl: buildGetUrl(base, path, seg.start, seg.duration),
    })
  }

  items.sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  )
  return { items }
}

/** Playback đọc băng thô — nhãn detect lấy từ tab Sự kiện, không kèm ở đây. */
export async function fetchPatrolPlaybackDetections(): Promise<CameraDetectionsResponse> {
  return { items: [] }
}

export function getPatrolDefaultPlaybackDate(): string {
  const now = new Date()
  const vn = new Date(now.getTime() + (7 * 60 + now.getTimezoneOffset()) * 60_000)
  return `${vn.getFullYear()}-${String(vn.getMonth() + 1).padStart(2, '0')}-${String(vn.getDate()).padStart(2, '0')}`
}
