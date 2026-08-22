/** Bridge metrics từ MobileCameraFeed → KPI Module 05 (HC-02). */
export interface PatrolMobileLiveSnapshot {
  cameraId: string
  personCount: number
  activePpeViolations: number
  identifiedWorkers: number
  workerNames: string[]
  updatedAt: number
}

let lastSnapshot: PatrolMobileLiveSnapshot | null = null
const listeners = new Set<(snap: PatrolMobileLiveSnapshot | null) => void>()

export function setPatrolMobileLiveSnapshot(snapshot: PatrolMobileLiveSnapshot): void {
  lastSnapshot = snapshot
  listeners.forEach(fn => fn(snapshot))
}

export function getPatrolMobileLiveSnapshot(cameraId: string): PatrolMobileLiveSnapshot | null {
  if (!lastSnapshot || lastSnapshot.cameraId !== cameraId) return null
  if (Date.now() - lastSnapshot.updatedAt > 12_000) return null
  return lastSnapshot
}

export function clearPatrolMobileLiveSnapshot(cameraId?: string): void {
  if (!cameraId || lastSnapshot?.cameraId === cameraId) {
    lastSnapshot = null
    listeners.forEach(fn => fn(null))
  }
}

export function subscribePatrolMobileLiveSnapshot(
  listener: (snap: PatrolMobileLiveSnapshot | null) => void,
): () => void {
  listeners.add(listener)
  if (lastSnapshot) listener(lastSnapshot)
  return () => listeners.delete(listener)
}
