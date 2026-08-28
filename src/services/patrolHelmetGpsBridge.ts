/**
 * GPS live của từng camera tuần tra → bản đồ + payload analyze (EKF + map match §6).
 *
 * Lưu theo từng camera. Bản trước giữ đúng **một** biến chung cho mọi mũ, nên
 * HC-01 và HC-02 ghi đè lẫn nhau: `getPatrolHelmetGps('HC-01')` trả null trừ
 * khi HC-01 tình cờ là bên ghi sau cùng, và chấm của mũ này có thể mọc lên
 * đúng vị trí của mũ kia.
 */
import { fuseHelmetPose } from '@/modules/module05-productivity/utils/positionEngine'
import { PATROL_SITE_CENTER } from '@/modules/module05-productivity/data/patrolSiteMap'

export interface PatrolHelmetGpsSnapshot {
  cameraId: string
  lat: number
  lng: number
  accuracyM?: number
  updatedAt: number
  /** raw | ekf | ekf_map | map | relative | site_anchor */
  positionMethod?: string
  /** Tâm công trường — không ghi mốc anchor GPS thật. */
  isDefault?: boolean
}

const FRESH_TTL_MS = 45_000
const LAST_KNOWN_TTL_MS = 30 * 60_000

const byCamera = new Map<string, PatrolHelmetGpsSnapshot>()
const listeners = new Set<(snap: PatrolHelmetGpsSnapshot) => void>()

export function setPatrolHelmetGps(snapshot: PatrolHelmetGpsSnapshot): void {
  if (snapshot.isDefault) {
    const next: PatrolHelmetGpsSnapshot = {
      ...snapshot,
      lat: PATROL_SITE_CENTER[0],
      lng: PATROL_SITE_CENTER[1],
      positionMethod: 'site_anchor',
    }
    byCamera.set(snapshot.cameraId, next)
    listeners.forEach(fn => fn(next))
    return
  }

  const fused = fuseHelmetPose({
    cameraId: snapshot.cameraId,
    lat: snapshot.lat,
    lng: snapshot.lng,
    accuracyM: snapshot.accuracyM,
    ts: snapshot.updatedAt,
  })
  if (fused.lat == null || fused.lng == null) return
  const next: PatrolHelmetGpsSnapshot = {
    ...snapshot,
    lat: fused.lat,
    lng: fused.lng,
    positionMethod: fused.method,
  }
  byCamera.set(snapshot.cameraId, next)
  listeners.forEach(fn => fn(next))
}

function readFresh(cameraId: string, ttlMs: number): PatrolHelmetGpsSnapshot | null {
  const snap = byCamera.get(cameraId)
  if (!snap) return null
  if (Date.now() - snap.updatedAt > ttlMs) return null
  return snap
}

export function getPatrolHelmetGps(cameraId: string): PatrolHelmetGpsSnapshot | null {
  return readFresh(cameraId, FRESH_TTL_MS)
}

/** GPS gần đây (kể cả hơi cũ) — dùng vẽ person dots khi fix mới chậm. */
export function getPatrolHelmetGpsLastKnown(
  cameraId: string,
): PatrolHelmetGpsSnapshot | null {
  return readFresh(cameraId, LAST_KNOWN_TTL_MS)
}

export function clearPatrolHelmetGps(cameraId?: string): void {
  if (cameraId) {
    byCamera.delete(cameraId)
    return
  }
  byCamera.clear()
}

export function subscribePatrolHelmetGps(
  listener: (snap: PatrolHelmetGpsSnapshot) => void,
): () => void {
  listeners.add(listener)
  byCamera.forEach(snap => listener(snap))
  return () => listeners.delete(listener)
}
