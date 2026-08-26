/**
 * Luồng camera đang phát sóng từ chính thiết bị này — chia sẻ trong cùng tab.
 *
 * Khi CMS và mũ là cùng một điện thoại, kéo video từ server về là vô nghĩa:
 * iOS chỉ cho camera chạy ở tab đang hiển thị, nên mở CMS ở tab khác là luồng
 * chết. Tile chỉ cần dùng lại đúng `MediaStream` đang publish — không độ trễ,
 * không phụ thuộc server đã sinh segment HLS hay chưa.
 *
 * Bridge chỉ sống trong một tab (biến module). Máy khác vẫn xem qua HLS như cũ.
 */

export type HelmetLocalBroadcastStatus = 'idle' | 'starting' | 'live' | 'error'

export interface HelmetLocalBroadcastSnapshot {
  helmetId: string
  status: HelmetLocalBroadcastStatus
  /** Luồng camera đang phát — null khi chưa mở được camera. */
  stream: MediaStream | null
  errorMessage?: string
  updatedAt: number
}

type Listener = (snapshot: HelmetLocalBroadcastSnapshot | null) => void

let current: HelmetLocalBroadcastSnapshot | null = null
const listeners = new Set<Listener>()

function emit(): void {
  for (const listener of listeners) {
    try {
      listener(current)
    } catch {
      // Một listener lỗi không được chặn các listener còn lại.
    }
  }
}

export function setHelmetLocalBroadcast(
  next: Omit<HelmetLocalBroadcastSnapshot, 'updatedAt'>,
): void {
  current = { ...next, updatedAt: Date.now() }
  emit()
}

export function clearHelmetLocalBroadcast(helmetId?: string): void {
  if (helmetId && current?.helmetId !== helmetId) return
  current = null
  emit()
}

export function getHelmetLocalBroadcast(
  helmetId?: string,
): HelmetLocalBroadcastSnapshot | null {
  if (!current) return null
  if (helmetId && current.helmetId !== helmetId) return null
  return current
}

/** Luồng local dùng được cho tile — chỉ khi track còn sống. */
export function getHelmetLocalStream(helmetId: string): MediaStream | null {
  const snap = getHelmetLocalBroadcast(helmetId)
  const track = snap?.stream?.getVideoTracks()[0]
  if (!track || track.readyState === 'ended') return null
  return snap?.stream ?? null
}

export function subscribeHelmetLocalBroadcast(listener: Listener): () => void {
  listeners.add(listener)
  listener(current)
  return () => {
    listeners.delete(listener)
  }
}
