import { advancePersonRoiTracks, predictPersonRoiTracks } from './personRoiTracker'
import { BboxDisplaySmoother } from './bboxDisplaySmoother'
import {
  PATROL_PERSON_ROI_CONFIG,
  resolvePatrolPersonRoiConfig,
  type PatrolPersonRoiConfig,
} from './patrolPersonRoi.config'
import type { PersonRoiDetection, PersonRoiDisplay, PersonRoiTrack } from './types'
import { isPatrolHeatmapEligibleId } from '../utils/patrolPatrolCounts'
import { resolveEffectivePatrolFlightMode } from '../utils/patrolFlightMode'

/**
 * Engine singleton per camera — overlay + heatmap dùng chung track state.
 * Pattern: detection @ low FPS → Kalman predict @ 60 FPS + EMA 4 góc (SORT demo).
 */
export class PatrolPersonRoiEngine {
  private tracks = new Map<string, PersonRoiTrack>()
  private listeners = new Set<() => void>()
  private lastIngestAt = 0
  private displayCache: PersonRoiDisplay[] = []
  private displaySmoother = new BboxDisplaySmoother()

  constructor(readonly cameraId: string) {}

  /**
   * Profile ghép của camera này. DR-* đổi được giữa tầm cao và tầm thấp giữa
   * phiên bay, nên đọc lại mỗi nhịp ingest thay vì chốt một lần lúc dựng engine.
   */
  private config(): PatrolPersonRoiConfig {
    return resolvePatrolPersonRoiConfig(
      this.cameraId,
      resolveEffectivePatrolFlightMode(this.cameraId),
    )
  }

  private polishDisplay(raw: PersonRoiDisplay[], predicting: boolean): PersonRoiDisplay[] {
    const active = new Set<string>()
    const alpha = predicting
      ? PATROL_PERSON_ROI_CONFIG.displayEmaGlideAlpha
      : PATROL_PERSON_ROI_CONFIG.displayEmaAlpha
    const snapDiagonalRatio = predicting ? 0.14 : 0.06
    const polished = raw.map(track => {
      active.add(track.trackId)
      // Track mất dấu — bỏ state smoother cũ để lần bám lại không kéo bbox từ vị trí cũ.
      if (track.state === 'lost') {
        this.displaySmoother.reset(track.trackId)
      }
      return {
        ...track,
        bbox: this.displaySmoother.smooth(track.trackId, track.bbox, { alpha, snapDiagonalRatio }),
      }
    })
    this.displaySmoother.prune(active)
    return polished
  }

  /** Gọi mỗi lần backend trả detections mới. */
  ingest(detections: PersonRoiDetection[], now = performance.now()): void {
    const cfg = this.config()
    const dtMs = this.lastIngestAt > 0 ? Math.max(16, now - this.lastIngestAt) : 450
    this.lastIngestAt = now
    this.tracks = advancePersonRoiTracks(this.tracks, detections, dtMs, Date.now(), cfg)
    this.displayCache = this.polishDisplay(predictPersonRoiTracks(this.tracks, 0, cfg), false)
    this.notify()
  }

  /** rAF — extrapolate bbox giữa các lần analyze. */
  predictDisplay(now = performance.now()): PersonRoiDisplay[] {
    const elapsed = this.lastIngestAt > 0 ? now - this.lastIngestAt : 0
    const cfg = this.config()

    /**
     * Luồng detections đứt hẳn — WebSocket rớt, worker VMS chết, tile chuyển
     * sang nền. `missStreak` chỉ tăng khi có nhịp ingest mới, nên không còn gì
     * đếm và lứa hộp cuối cùng đứng nguyên trên video vô thời hạn. Đó chính là
     * loại "ROI ảo" khó chịu nhất: nó trông y hệt một ROI thật.
     *
     * Bỏ luôn track chứ không chỉ ẩn: sau vài giây, vị trí đo cuối đã quá cũ để
     * ghép lại: giữ chúng chỉ khiến nhịp ingest đầu tiên sau khi nối lại bám vào
     * chỗ người đã đứng từ lâu.
     */
    if (this.lastIngestAt > 0 && elapsed > cfg.displayMaxStaleMs) {
      if (this.tracks.size > 0 || this.displayCache.length > 0) {
        this.tracks.clear()
        this.displayCache = []
        this.displaySmoother.clear()
      }
      return this.displayCache
    }

    if (elapsed < 4 || this.tracks.size === 0) return this.displayCache
    this.displayCache = this.polishDisplay(predictPersonRoiTracks(this.tracks, elapsed, cfg), true)
    return this.displayCache
  }

  getDisplayTracks(): PersonRoiDisplay[] {
    return this.displayCache
  }

  getHeatmapPersons(): Array<{ personId: string; label: string; confidence: number }> {
    return this.displayCache
      .filter(t => t.state === 'confirmed' && isPatrolHeatmapEligibleId(t.personId))
      .map(t => ({
        personId: t.personId,
        label: t.label,
        confidence: t.confidence,
      }))
  }

  clear(): void {
    this.tracks.clear()
    this.displayCache = []
    this.lastIngestAt = 0
    this.displaySmoother.clear()
    this.notify()
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    this.listeners.forEach(fn => fn())
  }
}

const engines = new Map<string, PatrolPersonRoiEngine>()

export function getPatrolPersonRoiEngine(cameraId: string): PatrolPersonRoiEngine {
  let engine = engines.get(cameraId)
  if (!engine) {
    engine = new PatrolPersonRoiEngine(cameraId)
    engines.set(cameraId, engine)
  }
  return engine
}

/**
 * Xoá track nhưng giữ nguyên instance engine.
 *
 * Khác `clearPatrolPersonRoiEngine`, hàm này không gỡ engine khỏi registry: các
 * overlay đang mounted giữ tham chiếu tới đúng instance đó, gỡ đi là lần ingest
 * sau dựng một engine mới mà không ai nghe. Dùng khi tile ngừng analyze nhưng
 * vẫn còn trên màn hình.
 */
export function clearPatrolPersonRoiTracks(cameraId: string): void {
  engines.get(cameraId)?.clear()
}

export function clearPatrolPersonRoiEngine(cameraId?: string): void {
  if (!cameraId) {
    engines.forEach(e => e.clear())
    engines.clear()
    return
  }
  engines.get(cameraId)?.clear()
  engines.delete(cameraId)
}

export { PATROL_PERSON_ROI_CONFIG }
