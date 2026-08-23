/** GPS live từ thiết bị HC-02 → map / analyze payload (EKF + map match §6). */
import { fuseHelmetPose } from '@/modules/module05-productivity/utils/positionEngine'

export interface PatrolHelmetGpsSnapshot {
  cameraId: string
  lat: number
  lng: number
  accuracyM?: number
  updatedAt: number
  /** raw | ekf | ekf_map | map */
  positionMethod?: string
}

const FRESH_TTL_MS = 45_000
const LAST_KNOWN_TTL_MS = 30 * 60_000

let lastSnapshot: PatrolHelmetGpsSnapshot | null = null
const listeners = new Set<(snap: PatrolHelmetGpsSnapshot) => void>()

export function setPatrolHelmetGps(snapshot: PatrolHelmetGpsSnapshot): void {
  const fused = fuseHelmetPose({
    cameraId: snapshot.cameraId,
    lat: snapshot.lat,
    lng: snapshot.lng,
    accuracyM: snapshot.accuracyM,
    ts: snapshot.updatedAt,
  })
  if (fused.lat == null || fused.lng == null) return
  lastSnapshot = {
    ...snapshot,
    lat: fused.lat,
    lng: fused.lng,
    positionMethod: fused.method,
  }
  listeners.forEach(fn => fn(lastSnapshot!))
}

export function getPatrolHelmetGps(cameraId: string): PatrolHelmetGpsSnapshot | null {
  if (!lastSnapshot || lastSnapshot.cameraId !== cameraId) return null
  if (Date.now() - lastSnapshot.updatedAt > FRESH_TTL_MS) return null
  return lastSnapshot
}

/** GPS gần đây (kể cả hơi cũ) — dùng vẽ person dots khi fix mới chậm. */
export function getPatrolHelmetGpsLastKnown(cameraId: string): PatrolHelmetGpsSnapshot | null {
  if (!lastSnapshot || lastSnapshot.cameraId !== cameraId) return null
  if (Date.now() - lastSnapshot.updatedAt > LAST_KNOWN_TTL_MS) return null
  return lastSnapshot
}

export function clearPatrolHelmetGps(cameraId?: string): void {
  if (!cameraId || lastSnapshot?.cameraId === cameraId) {
    lastSnapshot = null
  }
}

export function subscribePatrolHelmetGps(
  listener: (snap: PatrolHelmetGpsSnapshot) => void,
): () => void {
  listeners.add(listener)
  if (lastSnapshot) listener(lastSnapshot)
  return () => listeners.delete(listener)
}
