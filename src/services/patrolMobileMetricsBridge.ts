/** Bridge metrics từ MobileCameraFeed → KPI Module 05 (HC-02). */
export interface PatrolMobileLiveSnapshot {
  cameraId: string
  /** Camera đang mở (trước/sau đều online). */
  streamOnline: boolean
  /** Số người trên frame hiện tại (map dots). */
  personCount: number
  /** Peak cộng dồn phiên — KPI báo cáo, không giảm về 0. */
  peakPersonCount: number
  identifiedWorkers: number
  workerNames: string[]
  updatedAt: number
}

const SNAPSHOT_TTL_MS = 45_000

let lastSnapshot: PatrolMobileLiveSnapshot | null = null
const listeners = new Set<(snap: PatrolMobileLiveSnapshot | null) => void>()
/** Delay clear — flip cam / maximize không mất peak + online. */
let clearTimer: ReturnType<typeof setTimeout> | null = null

function emit(snap: PatrolMobileLiveSnapshot | null): void {
  listeners.forEach(fn => fn(snap))
}

export function setPatrolMobileLiveSnapshot(snapshot: {
  cameraId: string
  streamOnline: boolean
  personCount: number
  identifiedWorkers?: number
  workerNames?: string[]
  updatedAt: number
}): void {
  const prev =
    lastSnapshot?.cameraId === snapshot.cameraId ? lastSnapshot : null
  const personCount = Math.max(0, Math.floor(snapshot.personCount))
  const peakPersonCount = Math.max(
    personCount,
    prev?.peakPersonCount ?? 0,
  )
  const identifiedWorkers = Math.max(
    Math.max(0, Math.floor(snapshot.identifiedWorkers ?? 0)),
    prev?.identifiedWorkers ?? 0,
  )
  const workerNames = [
    ...new Set([...(prev?.workerNames ?? []), ...(snapshot.workerNames ?? [])]),
  ].slice(0, 8)

  lastSnapshot = {
    cameraId: snapshot.cameraId,
    streamOnline: snapshot.streamOnline,
    personCount,
    peakPersonCount,
    identifiedWorkers,
    workerNames,
    updatedAt: snapshot.updatedAt,
  }
  emit(lastSnapshot)
}

/** Heartbeat online khi cam live — giữ peak, không clear khi flip. */
export function touchPatrolMobileStreamOnline(cameraId: string): void {
  const now = Date.now()
  if (lastSnapshot?.cameraId === cameraId) {
    lastSnapshot = {
      ...lastSnapshot,
      streamOnline: true,
      updatedAt: now,
    }
  } else {
    lastSnapshot = {
      cameraId,
      streamOnline: true,
      personCount: 0,
      peakPersonCount: 0,
      identifiedWorkers: 0,
      workerNames: [],
      updatedAt: now,
    }
  }
  emit(lastSnapshot)
}

export function getPatrolMobileLiveSnapshot(cameraId: string): PatrolMobileLiveSnapshot | null {
  if (!lastSnapshot || lastSnapshot.cameraId !== cameraId) return null
  if (Date.now() - lastSnapshot.updatedAt > SNAPSHOT_TTL_MS) return null
  return lastSnapshot
}

export function clearPatrolMobileLiveSnapshot(cameraId?: string): void {
  if (clearTimer != null) {
    window.clearTimeout(clearTimer)
    clearTimer = null
  }
  if (!cameraId || lastSnapshot?.cameraId === cameraId) {
    lastSnapshot = null
    emit(null)
  }
}

export function scheduleClearPatrolMobileLiveSnapshot(
  cameraId: string,
  delayMs = 2500,
): void {
  if (clearTimer != null) window.clearTimeout(clearTimer)
  clearTimer = setTimeout(() => {
    clearTimer = null
    clearPatrolMobileLiveSnapshot(cameraId)
  }, delayMs)
}

export function cancelScheduledClearPatrolMobile(): void {
  if (clearTimer != null) {
    window.clearTimeout(clearTimer)
    clearTimer = null
  }
}

export function subscribePatrolMobileLiveSnapshot(
  listener: (snap: PatrolMobileLiveSnapshot | null) => void,
): () => void {
  listeners.add(listener)
  if (lastSnapshot) listener(lastSnapshot)
  return () => listeners.delete(listener)
}
