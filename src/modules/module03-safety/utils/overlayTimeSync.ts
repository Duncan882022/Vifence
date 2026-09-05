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
 * WebRTC (WHEP) không có PDT — FE ước lượng wallclock (~400ms) gửi at_ms cho backend;
 * fallback buffer FE chỉ dùng khi backend chưa aligned.
 */
import type { VmsDetectionSnapshot } from '../services/vmsDetections.service'

/** Giữ đủ lịch sử cho HLS trễ nhất (~10s) ở nhịp AI 6 FPS. */
const MAX_BUFFERED_SNAPSHOTS = 90
/** Lệch quá ngưỡng này coi như không khớp — rơi về lag fallback. Patrol HLS ~5s. */
const MAX_MATCH_DRIFT_MS = 4000
/** Patrol HLS — cho phép khớp PDT khi lag ≥ PATROL_LIVE_ROI_DELAY_MS. */
const PATROL_MATCH_DRIFT_BUFFER_MS = 2000

export interface OverlayTimeSource {
  /** Wallclock (ms) của khung hình đang hiển thị, null khi không xác định được. */
  getDisplayWallclockMs: () => number | null
}

export interface OverlaySyncResult {
  snapshot: VmsDetectionSnapshot | null
  /** Đã khớp theo thời gian hay đang dùng snapshot mới nhất / lag fallback. */
  matched: boolean
  /** Độ lệch giữa snapshot chọn được và khung hình (ms) — dùng để chẩn đoán. */
  driftMs: number | null
}

export interface OverlayResolveOptions {
  /** Khi không khớp PDT — lấy snapshot ~N ms trước (patrol HLS). */
  fallbackLagMs?: number
  /** Hiệu chỉnh lệch đồng hồ client ↔ server (ms). */
  clientServerSkewMs?: number
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
   * Không có mốc thời gian hoặc lệch quá lớn → fallback lag hoặc snapshot mới nhất.
   */
  resolve(displayWallclockMs: number | null, opts?: OverlayResolveOptions): OverlaySyncResult {
    const latest = this.latest()
    if (latest === null) return { snapshot: null, matched: false, driftMs: null }

    const skewMs = opts?.clientServerSkewMs ?? 0
    const lagMs = opts?.fallbackLagMs

    if (displayWallclockMs === null || this.snapshots.length === 1) {
      const lagged = this.resolveFallbackLag(lagMs, displayWallclockMs, skewMs)
      if (lagged) return lagged
      return { snapshot: latest, matched: false, driftMs: null }
    }

    const adjustedDisplayMs = displayWallclockMs + skewMs

    let best = latest
    let bestDrift = Number.POSITIVE_INFINITY

    // Duyệt ngược: khung hình đang xem thường gần cuối buffer.
    for (let i = this.snapshots.length - 1; i >= 0; i -= 1) {
      const candidate = this.snapshots[i]
      const wallclock = snapshotWallclockMs(candidate)
      if (wallclock === null) continue
      // AI mới hơn khung đang phát → bbox chạy trước video (HC-01 / DR-03 HLS).
      if (wallclock > adjustedDisplayMs + 250) continue

      const drift = Math.abs(wallclock - adjustedDisplayMs)
      if (drift < bestDrift) {
        bestDrift = drift
        best = candidate
      } else if (wallclock < adjustedDisplayMs) {
        // Đi xa dần về quá khứ — không thể tốt hơn nữa.
        break
      }
    }

    if (!Number.isFinite(bestDrift)) {
      const lagged = this.resolveFallbackLag(lagMs, displayWallclockMs, skewMs)
      if (lagged) return lagged
      return { snapshot: latest, matched: false, driftMs: null }
    }

    if (bestDrift > this.maxMatchDriftMs(lagMs)) {
      const lagged = this.resolveFallbackLag(lagMs, displayWallclockMs, skewMs)
      if (lagged) return lagged
      return { snapshot: latest, matched: false, driftMs: null }
    }

    return { snapshot: best, matched: true, driftMs: Math.round(bestDrift) }
  }

  /** Patrol HLS — snapshot ~fallbackLagMs trước thay vì bbox mới nhất (đuổi theo). */
  private resolveFallbackLag(
    fallbackLagMs?: number,
    displayWallclockMs?: number | null,
    skewMs = 0,
  ): OverlaySyncResult | null {
    if (fallbackLagMs == null || fallbackLagMs <= 0 || this.snapshots.length === 0) {
      return null
    }
    const anchor = displayWallclockMs != null
      ? displayWallclockMs + skewMs
      : Date.now() - skewMs
    const target = anchor - fallbackLagMs
    let best: VmsDetectionSnapshot | null = null
    let bestDrift = Number.POSITIVE_INFINITY
    for (const candidate of this.snapshots) {
      const wallclock = snapshotWallclockMs(candidate)
      if (wallclock === null) continue
      const drift = Math.abs(wallclock - target)
      if (drift < bestDrift) {
        bestDrift = drift
        best = candidate
      }
    }
    if (best === null) return null
    return { snapshot: best, matched: true, driftMs: Math.round(bestDrift) }
  }

  private maxMatchDriftMs(fallbackLagMs?: number): number {
    if (fallbackLagMs != null && fallbackLagMs > 0) {
      return Math.max(MAX_MATCH_DRIFT_MS, fallbackLagMs + PATROL_MATCH_DRIFT_BUFFER_MS)
    }
    return MAX_MATCH_DRIFT_MS
  }
}
