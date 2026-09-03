/**
 * Cửa chờ đệm video — chỉ vẽ ROI khi mọi camera đã đệm đủ.
 *
 * Lúc grid vừa mở, mỗi tile còn đang kéo phân đoạn đầu: `buffered` gần như rỗng,
 * playlist chưa có PROGRAM-DATE-TIME, và độ trễ thật của luồng chưa đo được. Vẽ
 * bbox ngay lúc đó là vẽ theo phỏng đoán — hộp rơi lệch hẳn khỏi người, rồi tự
 * nhảy về chỗ đúng vài giây sau. Chỉ huy nhìn thấy đúng đoạn sai đó.
 *
 * Nên chờ tới khi tất cả camera đã đệm đủ ngưỡng rồi mới bật overlay: từ mốc đó
 * độ trễ đã ổn định, backend chọn lại đúng khung hình và hộp bám người ngay từ
 * hộp đầu tiên.
 *
 * Hai điều kiện an toàn, thiếu cái nào cũng thành "không bao giờ hiện box":
 * - luồng độ trễ thấp (WHEP) không bao giờ đệm tới 5s → khai báo `needsBuffer:
 *   false` và không tính vào cửa;
 * - luồng đệm mãi không đạt ngưỡng (mạng yếu, cấu hình buffer ngắn) vẫn được cho
 *   qua sau {@link BUFFER_WAIT_TIMEOUT_MS}.
 */

/** Mức đệm coi là đủ để độ trễ luồng đã ổn định. */
export const OVERLAY_BUFFER_TARGET_MS = 5000

/** Chờ tối đa từng camera trước khi cho qua dù chưa đệm đủ. */
export const BUFFER_WAIT_TIMEOUT_MS = 8000

export interface CameraBufferReport {
  /** Số ms video đã đệm sẵn phía trước điểm đang phát. */
  bufferedAheadMs: number
  /** Luồng có cần đệm không. WHEP độ trễ thấp đặt false. */
  needsBuffer: boolean
}

interface CameraBufferState extends CameraBufferReport {
  registeredAtMs: number
  /** Đã từng đạt ngưỡng (hoặc hết hạn chờ) — không tụt lại nữa. */
  primed: boolean
}

export interface OverlayBufferGate {
  /** Đã đủ điều kiện vẽ overlay chưa. */
  open: boolean
  /** Camera còn đang đệm — hiện trên tile để người dùng biết đang chờ gì. */
  pending: string[]
  readyCount: number
  totalCount: number
}

const states = new Map<string, CameraBufferState>()
const listeners = new Set<() => void>()

let gate: OverlayBufferGate = { open: true, pending: [], readyCount: 0, totalCount: 0 }

function now(): number {
  return Date.now()
}

function sameGate(a: OverlayBufferGate, b: OverlayBufferGate): boolean {
  return (
    a.open === b.open
    && a.readyCount === b.readyCount
    && a.totalCount === b.totalCount
    && a.pending.length === b.pending.length
    && a.pending.every((id, i) => id === b.pending[i])
  )
}

function recomputeGate(): void {
  const pending: string[] = []
  let readyCount = 0
  let gating = 0

  for (const [cameraId, state] of states) {
    if (!state.needsBuffer) continue
    gating += 1
    if (state.primed) {
      readyCount += 1
    } else {
      pending.push(cameraId)
    }
  }

  pending.sort()
  const next: OverlayBufferGate = {
    // Chưa có camera nào đăng ký thì không có gì để chờ.
    open: gating === 0 || pending.length === 0,
    pending,
    readyCount,
    totalCount: gating,
  }

  if (sameGate(gate, next)) return
  gate = next
  listeners.forEach(fn => fn())
}

function isPrimed(state: CameraBufferState, at: number): boolean {
  if (state.primed) return true
  if (!state.needsBuffer) return true
  if (state.bufferedAheadMs >= OVERLAY_BUFFER_TARGET_MS) return true
  return at - state.registeredAtMs >= BUFFER_WAIT_TIMEOUT_MS
}

export function reportCameraBufferState(cameraId: string, report: CameraBufferReport): void {
  if (!cameraId) return
  const at = now()
  const prev = states.get(cameraId)
  const bufferedAheadMs = Number.isFinite(report.bufferedAheadMs)
    ? Math.max(0, report.bufferedAheadMs)
    : 0

  const state: CameraBufferState = {
    bufferedAheadMs,
    needsBuffer: report.needsBuffer,
    registeredAtMs: prev?.registeredAtMs ?? at,
    primed: prev?.primed ?? false,
  }
  state.primed = isPrimed(state, at)
  states.set(cameraId, state)
  recomputeGate()
}

/** Tile rời màn hình hoặc đổi nguồn — bỏ khỏi cửa chờ. */
export function clearCameraBufferState(cameraId: string): void {
  if (!states.delete(cameraId)) return
  recomputeGate()
}

export function getOverlayBufferGate(): OverlayBufferGate {
  return gate
}

export function isOverlayBufferGateOpen(): boolean {
  return gate.open
}

/**
 * Độ trễ đo được của một camera — dùng thay hằng số 5s khi playlist thiếu
 * PROGRAM-DATE-TIME, vì đây là con số thật của chính luồng đang xem.
 */
export function getCameraBufferedAheadMs(cameraId: string): number | null {
  const state = states.get(cameraId)
  if (!state || !state.needsBuffer) return null
  return state.bufferedAheadMs
}

export function subscribeOverlayBufferGate(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Chỉ dùng trong test — trả registry về trạng thái ban đầu. */
export function resetCameraBufferReadiness(): void {
  states.clear()
  gate = { open: true, pending: [], readyCount: 0, totalCount: 0 }
  listeners.forEach(fn => fn())
}
