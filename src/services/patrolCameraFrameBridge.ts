/** Tile đã decode khung hình — badge LIVE ưu tiên hơn metrics trễ. */
const liveById = new Map<string, boolean>()
const listeners = new Set<() => void>()

function emit(): void {
  listeners.forEach(fn => fn())
}

export function setPatrolCameraFramesLive(cameraId: string, live: boolean): void {
  const prev = liveById.get(cameraId) ?? false
  if (prev === live) return
  if (live) {
    liveById.set(cameraId, true)
  } else {
    liveById.delete(cameraId)
  }
  emit()
}

export function getPatrolCameraFramesLive(cameraId: string): boolean {
  return liveById.get(cameraId) ?? false
}

export function subscribePatrolCameraFramesLive(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getPatrolCameraFramesLiveMap(): ReadonlyMap<string, boolean> {
  return liveById
}
