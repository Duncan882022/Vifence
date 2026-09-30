import { getMediaMtxPlaybackBase, mediaMtxPathForCamera } from '@/modules/module05-productivity/data/helmetIngest'
import type { SessionVideo } from '../../workflow.types'

interface Segment {
  start: string
  duration: number
}

/**
 * Bản ghi gốc của H1 trên MediaMTX trong khung giờ phiên (`/list` + `/get`).
 * Trả null khi path chưa bật ghi hoặc không có segment.
 */
export async function findMediaMtxRecording(helmetId: string, startIso: string, endIso: string): Promise<SessionVideo | null> {
  const base = getMediaMtxPlaybackBase()
  if (!base) return null
  const path = mediaMtxPathForCamera(helmetId)
  const query = new URLSearchParams({ path, start: startIso, end: endIso })
  try {
    const res = await fetch(`${base}/list?${query.toString()}`, { mode: 'cors', signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const segments = (await res.json()) as Segment[] | null
    if (!Array.isArray(segments) || segments.length === 0) return null
    const durationSec = Math.max(1, Math.round((Date.parse(endIso) - Date.parse(startIso)) / 1000))
    const params = new URLSearchParams({ path, start: startIso, duration: String(durationSec), format: 'mp4' })
    return { source: 'mediamtx', url: `${base}/get?${params.toString()}`, durationSec }
  } catch {
    return null
  }
}
