/**
 * Flymap — heatmap mật độ flycam tầm cao (DR-*), overlay lên luồng video.
 */
import {
  ensurePatrolAuth,
  getPatrolAccessToken,
  patrolBackendBase,
} from '@/services/patrolApiClient'

export interface PatrolDroneHeatmapMetrics {
  cameraId: string
  framePersonCount: number
  trackCount: number
  personCount: number
  updatedAt: number
}

export function patrolDroneHeatmapImageUrl(cameraId: string, bustMs?: number): string | null {
  const base = patrolBackendBase()
  if (!base) return null
  const bust = bustMs ?? Date.now()
  return `${base}/patrol/${encodeURIComponent(cameraId)}/heatmap.png?v=${bust}`
}

export async function fetchPatrolDroneHeatmapBlobUrl(
  cameraId: string,
): Promise<string | null> {
  const base = patrolBackendBase()
  if (!base) return null
  await ensurePatrolAuth()
  const token = getPatrolAccessToken()
  const url = `${base}/patrol/${encodeURIComponent(cameraId)}/heatmap.png?v=${Date.now()}`
  try {
    const res = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      mode: 'cors',
    })
    if (!res.ok) return null
    const blob = await res.blob()
    return URL.createObjectURL(blob)
  } catch {
    return null
  }
}

export async function fetchPatrolDroneHeatmapMetrics(
  cameraId: string,
): Promise<PatrolDroneHeatmapMetrics | null> {
  const base = patrolBackendBase()
  if (!base) return null
  await ensurePatrolAuth()
  const token = getPatrolAccessToken()
  try {
    const res = await fetch(`${base}/patrol/${encodeURIComponent(cameraId)}/metrics`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      mode: 'cors',
    })
    if (!res.ok) return null
    const data = await res.json() as Record<string, unknown>
    return {
      cameraId,
      framePersonCount: Number(data.frame_person_count ?? data.person_count ?? 0),
      trackCount: Number(data.track_count ?? data.person_count ?? 0),
      personCount: Number(data.person_count ?? data.track_count ?? 0),
      updatedAt: Number(data.updated_at ?? 0),
    }
  } catch {
    return null
  }
}
