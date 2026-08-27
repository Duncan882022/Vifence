import { advancePersonRoiTracks, predictPersonRoiTracks } from './personRoiTracker'
import { BboxDisplaySmoother } from './bboxDisplaySmoother'
import { PATROL_PERSON_ROI_CONFIG } from './patrolPersonRoi.config'
import type { PersonRoiDetection, PersonRoiDisplay, PersonRoiTrack } from './types'
import { isPatrolHeatmapEligibleId } from '../utils/patrolPatrolCounts'

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

  private polishDisplay(raw: PersonRoiDisplay[], predicting: boolean): PersonRoiDisplay[] {
    const active = new Set<string>()
    const alpha = predicting
      ? PATROL_PERSON_ROI_CONFIG.displayEmaGlideAlpha
      : PATROL_PERSON_ROI_CONFIG.displayEmaAlpha
    const polished = raw.map(track => {
      active.add(track.trackId)
      return {
        ...track,
        bbox: this.displaySmoother.smooth(track.trackId, track.bbox, { alpha }),
      }
    })
    this.displaySmoother.prune(active)
    return polished
  }

  /** Gọi mỗi lần backend trả detections mới. */
  ingest(detections: PersonRoiDetection[], now = performance.now()): void {
    const dtMs = this.lastIngestAt > 0 ? Math.max(16, now - this.lastIngestAt) : 450
    this.lastIngestAt = now
    this.tracks = advancePersonRoiTracks(this.tracks, detections, dtMs, Date.now())
    this.displayCache = this.polishDisplay(predictPersonRoiTracks(this.tracks, 0), false)
    this.notify()
  }

  /** rAF — extrapolate bbox giữa các lần analyze. */
  predictDisplay(now = performance.now()): PersonRoiDisplay[] {
    const elapsed = this.lastIngestAt > 0 ? now - this.lastIngestAt : 0
    if (elapsed < 4 || this.tracks.size === 0) return this.displayCache
    this.displayCache = this.polishDisplay(predictPersonRoiTracks(this.tracks, elapsed), true)
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
