/** GPS live từ thiết bị HC-02 → map / analyze payload. */
export interface PatrolHelmetGpsSnapshot {
  cameraId: string
  lat: number
  lng: number
  accuracyM?: number
  updatedAt: number
}

const FRESH_TTL_MS = 45_000
const LAST_KNOWN_TTL_MS = 30 * 60_000

let lastSnapshot: PatrolHelmetGpsSnapshot | null = null
const listeners = new Set<(snap: PatrolHelmetGpsSnapshot) => void>()

export function setPatrolHelmetGps(snapshot: PatrolHelmetGpsSnapshot): void {
  lastSnapshot = snapshot
  listeners.forEach(fn => fn(snapshot))
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
