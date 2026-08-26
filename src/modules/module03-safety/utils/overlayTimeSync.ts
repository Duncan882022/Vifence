/**
 * Đồng bộ overlay theo thời gian — vẽ bbox đúng khung hình đang hiển thị.
 *
 * Vấn đề đang có: AI phân tích frame tại thời điểm T và trả detections ngay,
 * nhưng HLS đưa khung hình T tới người xem chậm 2–6 giây. FE vẽ luôn detections
 * mới nhất nên bbox chạy **trước** video vài giây — thấy rõ khi người đi ngang.
 *
 * Cách khắc phục: backend gắn `frame_wallclock_ms` (lúc nhận frame từ camera) vào
 * mỗi snapshot, đồng thời playlist HLS có EXT-X-PROGRAM-DATE-TIME. FE đọc wallclock
 * của khung hình đang phát rồi lấy snapshot khớp thời điểm đó.
 *
 * WebRTC (WHEP) không có PDT nhưng độ trễ chỉ ~300ms nên dùng snapshot mới nhất.
 */
import type { VmsDetectionSnapshot } from '../services/vmsDetections.service'

/** Giữ đủ lịch sử cho HLS trễ nhất (~10s) ở nhịp AI 6 FPS. */
const MAX_BUFFERED_SNAPSHOTS = 90
/** Lệch quá ngưỡng này coi như không khớp — rơi về snapshot mới nhất. */
const MAX_MATCH_DRIFT_MS = 4000

export interface OverlayTimeSource {
  /** Wallclock (ms) của khung hình đang hiển thị, null khi không xác định được. */
  getDisplayWallclockMs: () => number | null
}

export interface OverlaySyncResult {
  snapshot: VmsDetectionSnapshot | null
  /** Đã khớp theo thời gian hay đang dùng snapshot mới nhất. */
  matched: boolean
  /** Độ lệch giữa snapshot chọn được và khung hình (ms) — dùng để chẩn đoán. */
  driftMs: number | null
}

function snapshotWallclockMs(snapshot: VmsDetectionSnapshot): number | null {
  const frameWallclock = snapshot.frame_wallclock_ms
  if (typeof frameWallclock === 'number' && frameWallclock > 0) return frameWallclock
  // Backend cũ chưa gửi frame_wallclock_ms — updated_at (giây) là xấp xỉ gần nhất.
  if (snapshot.updated_at > 0) return snapshot.updated_at * 1000
  return null
}

/**
 * Bộ đệm snapshot theo thời gian.
 * Một instance cho mỗi camera tile; không chia sẻ giữa các tile để tránh
 * tile này ghi đè lịch sử của tile kia.
 */
export class OverlayTimeBuffer {
  private snapshots: VmsDetectionSnapshot[] = []

  push(snapshot: VmsDetectionSnapshot): void {
    const wallclock = snapshotWallclockMs(snapshot)
    const last = this.snapshots[this.snapshots.length - 1]

    // Cùng thời điểm → thay tại chỗ, tránh phình buffer khi backend gửi lại.
    if (last && snapshotWallclockMs(last) === wallclock) {
      this.snapshots[this.snapshots.length - 1] = snapshot
      return
    }

    this.snapshots.push(snapshot)
    if (this.snapshots.length > MAX_BUFFERED_SNAPSHOTS) {
      this.snapshots.splice(0, this.snapshots.length - MAX_BUFFERED_SNAPSHOTS)
    }
  }

  clear(): void {
    this.snapshots = []
  }

  latest(): VmsDetectionSnapshot | null {
    return this.snapshots[this.snapshots.length - 1] ?? null
  }

  /**
   * Chọn snapshot khớp khung hình đang hiển thị.
   * Không có mốc thời gian hoặc lệch quá lớn → trả snapshot mới nhất.
   */
  resolve(displayWallclockMs: number | null): OverlaySyncResult {
    const latest = this.latest()
    if (latest === null) return { snapshot: null, matched: false, driftMs: null }
    if (displayWallclockMs === null || this.snapshots.length === 1) {
      return { snapshot: latest, matched: false, driftMs: null }
    }

    let best = latest
    let bestDrift = Number.POSITIVE_INFINITY

    // Duyệt ngược: khung hình đang xem thường gần cuối buffer.
    for (let i = this.snapshots.length - 1; i >= 0; i -= 1) {
      const candidate = this.snapshots[i]
      const wallclock = snapshotWallclockMs(candidate)
      if (wallclock === null) continue

      const drift = Math.abs(wallclock - displayWallclockMs)
      if (drift < bestDrift) {
        bestDrift = drift
        best = candidate
      } else if (wallclock < displayWallclockMs) {
        // Đi xa dần về quá khứ — không thể tốt hơn nữa.
        break
      }
    }

    if (!Number.isFinite(bestDrift) || bestDrift > MAX_MATCH_DRIFT_MS) {
      return { snapshot: latest, matched: false, driftMs: null }
    }

    return { snapshot: best, matched: true, driftMs: Math.round(bestDrift) }
  }
}
