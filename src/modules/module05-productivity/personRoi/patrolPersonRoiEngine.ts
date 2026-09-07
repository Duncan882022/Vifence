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
 * Helmet UX: cover-or-hide — vẽ bbox đo YOLO, ẩn khi miss, không follow rAF.
 */
export class PatrolPersonRoiEngine {
  private tracks = new Map<string, PersonRoiTrack>()
  private listeners = new Set<() => void>()
  private lastIngestAt = 0
  private displayCache: PersonRoiDisplay[] = []
  private displaySmoother = new BboxDisplaySmoother()
  /** HC-02 publish từ chính máy — analyze JPEG trễ so với khung video. */
  private localPublisher = false
  /** WHEP/WebRTC live — ưu tiên bám người di chuyển. */
  private lowLatencyLive = false

  constructor(readonly cameraId: string) {}

  setLocalPublisherMode(enabled: boolean): void {
    this.localPublisher = enabled
  }

  setLowLatencyLiveMode(enabled: boolean): void {
    this.lowLatencyLive = enabled
  }

  /**
   * Profile ghép của camera này. DR-* đổi được giữa tầm cao và tầm thấp giữa
   * phiên bay, nên đọc lại mỗi nhịp ingest thay vì chốt một lần lúc dựng engine.
   */
  private config(): PatrolPersonRoiConfig {
    return resolvePatrolPersonRoiConfig(
      this.cameraId,
      resolveEffectivePatrolFlightMode(this.cameraId),
      { localPublisher: this.localPublisher, lowLatencyLive: this.lowLatencyLive },
    )
  }

  private polishDisplay(
    raw: PersonRoiDisplay[],
    predicting: boolean,
    cfg: PatrolPersonRoiConfig,
  ): PersonRoiDisplay[] {
    const active = new Set<string>()
    const alpha = predicting ? cfg.displayEmaGlideAlpha : cfg.displayEmaAlpha
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
    this.displayCache = this.polishDisplay(predictPersonRoiTracks(this.tracks, 0, cfg), false, cfg)
    this.notify()
  }

  /** rAF — cover-or-hide: giữ cache đo cuối, không nội suy bbox. */
  predictDisplay(now = performance.now()): PersonRoiDisplay[] {
    const elapsed = this.lastIngestAt > 0 ? now - this.lastIngestAt : 0
    const cfg = this.config()

    if (this.lastIngestAt > 0 && elapsed > cfg.displayMaxStaleMs) {
      if (this.tracks.size > 0 || this.displayCache.length > 0) {
        this.tracks.clear()
        this.displayCache = []
        this.displaySmoother.clear()
      }
      return this.displayCache
    }

    // maxPredictMs=0 → không slide bbox giữa các nhịp analyze.
    if (cfg.maxPredictMs <= 0) {
      return this.displayCache
    }

    if (elapsed < 1 || this.tracks.size === 0) return this.displayCache
    this.displayCache = this.polishDisplay(predictPersonRoiTracks(this.tracks, elapsed, cfg), true, cfg)
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

export function setPatrolPersonRoiLocalPublisher(cameraId: string, enabled: boolean): void {
  getPatrolPersonRoiEngine(cameraId).setLocalPublisherMode(enabled)
}

export function setPatrolPersonRoiLowLatencyLive(cameraId: string, enabled: boolean): void {
  getPatrolPersonRoiEngine(cameraId).setLowLatencyLiveMode(enabled)
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
