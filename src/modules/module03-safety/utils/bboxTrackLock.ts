export type Bbox = [number, number, number, number]

export interface BboxDetection {
  behavior: string
  bbox: Bbox
  confidence?: number
}

export interface TrackLockConfig {
  /** IoU tối thiểu để gán detection vào track hiện có */
  matchIouMin: number
  /** IoU dưới ngưỡng này → bỏ khoá ngay (không coast) */
  unlockIouMin: number
  /** Số lần poll liên tiếp không match trước khi xóa track */
  maxMissFrames: number
  /** EMA bbox khi đang khoá — cao hơn = bám nhanh hơn */
  smoothAlpha: number
  /** Conf thấp hơn → bỏ khoá */
  minConfidence: number
  /** Chỉ match detection cùng behavior */
  matchSameBehavior: boolean
}

export const DEFAULT_TRACK_LOCK_CONFIG: TrackLockConfig = {
  matchIouMin: 0.24,
  unlockIouMin: 0.11,
  maxMissFrames: 3,
  smoothAlpha: 0.48,
  minConfidence: 0.68,
  matchSameBehavior: true,
}

export interface TrackLockState<T extends BboxDetection> {
  id: string
  detection: T
  smoothedBbox: Bbox
  missCount: number
  lastMatchIou: number
  locked: boolean
  /** Vận tốc tâm bbox (px/frame analyze) — dùng coast khi mất detect. */
  velocity: [number, number]
}

export interface TrackedDetection<T extends BboxDetection> extends BboxDetection {
  trackId: string
  trackLocked: boolean
  trackScore: number
  behavior: T['behavior']
  bbox: Bbox
  confidence?: number
}

let trackSeq = 0

export function nextTrackId(prefix = 'trk'): string {
  trackSeq += 1
  return `${prefix}-${trackSeq}`
}

export function bboxIou(a: Bbox, b: Bbox): number {
  const ix1 = Math.max(a[0], b[0])
  const iy1 = Math.max(a[1], b[1])
  const ix2 = Math.min(a[2], b[2])
  const iy2 = Math.min(a[3], b[3])
  if (ix2 <= ix1 || iy2 <= iy1) return 0
  const inter = (ix2 - ix1) * (iy2 - iy1)
  const areaA = Math.max(0, a[2] - a[0]) * Math.max(0, a[3] - a[1])
  const areaB = Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1])
  const union = areaA + areaB - inter
  return union > 0 ? inter / union : 0
}

function blendBbox(current: Bbox, previous: Bbox, alpha: number): Bbox {
  const beta = 1 - alpha
  return [
    current[0] * alpha + previous[0] * beta,
    current[1] * alpha + previous[1] * beta,
    current[2] * alpha + previous[2] * beta,
    current[3] * alpha + previous[3] * beta,
  ]
}

function bboxCenter(b: Bbox): [number, number] {
  return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2]
}

function shiftBbox(b: Bbox, dx: number, dy: number): Bbox {
  return [b[0] + dx, b[1] + dy, b[2] + dx, b[3] + dy]
}

function updateVelocity(prev: Bbox, next: Bbox, prevVel: [number, number], alpha = 0.65): [number, number] {
  const [px, py] = bboxCenter(prev)
  const [nx, ny] = bboxCenter(next)
  const dx = nx - px
  const dy = ny - py
  return [
    prevVel[0] * (1 - alpha) + dx * alpha,
    prevVel[1] * (1 - alpha) + dy * alpha,
  ]
}

function canMatchBehavior(track: BboxDetection, det: BboxDetection, sameBehavior: boolean): boolean {
  return !sameBehavior || track.behavior === det.behavior
}

function detectionConfidence(det: BboxDetection): number {
  return det.confidence ?? 1
}

interface MatchPair {
  trackId: string
  detIndex: number
  iou: number
}

/**
 * Multi-object track lock — IoU greedy match, EMA smooth, bỏ khoá khi lệch/conf thấp.
 */
export function advanceBboxTrackLock<T extends BboxDetection>(
  prevTracks: Map<string, TrackLockState<T>>,
  detections: T[],
  config: TrackLockConfig = DEFAULT_TRACK_LOCK_CONFIG,
): { tracks: Map<string, TrackLockState<T>>; output: Array<T & TrackedDetection<T>> } {
  const pairs: MatchPair[] = []

  for (const [trackId, track] of prevTracks) {
    detections.forEach((det, detIndex) => {
      if (!canMatchBehavior(track.detection, det, config.matchSameBehavior)) return
      const iou = bboxIou(track.smoothedBbox, det.bbox)
      if (iou >= config.matchIouMin) {
        pairs.push({ trackId, detIndex, iou })
      }
    })
  }

  pairs.sort((a, b) => b.iou - a.iou)

  const usedTracks = new Set<string>()
  const usedDets = new Set<number>()
  const assignments = new Map<string, { det: T; iou: number }>()

  for (const pair of pairs) {
    if (usedTracks.has(pair.trackId) || usedDets.has(pair.detIndex)) continue
    usedTracks.add(pair.trackId)
    usedDets.add(pair.detIndex)
    assignments.set(pair.trackId, { det: detections[pair.detIndex], iou: pair.iou })
  }

  const nextTracks = new Map<string, TrackLockState<T>>()
  const output: Array<T & TrackedDetection<T>> = []

  for (const [trackId, track] of prevTracks) {
    const hit = assignments.get(trackId)
    if (hit) {
      const conf = detectionConfidence(hit.det)
      if (conf < config.minConfidence || hit.iou < config.unlockIouMin) {
        continue
      }
      const smoothedBbox = blendBbox(hit.det.bbox, track.smoothedBbox, config.smoothAlpha)
      const velocity = updateVelocity(track.smoothedBbox, smoothedBbox, track.velocity ?? [0, 0])
      const merged = {
        ...hit.det,
        bbox: smoothedBbox,
      }
      nextTracks.set(trackId, {
        id: trackId,
        detection: merged,
        smoothedBbox,
        missCount: 0,
        lastMatchIou: hit.iou,
        locked: hit.iou >= config.matchIouMin,
        velocity,
      })
      output.push({
        ...merged,
        trackId,
        trackLocked: hit.iou >= config.matchIouMin,
        trackScore: hit.iou,
      })
      continue
    }

    const missCount = track.missCount + 1
    const canCoast =
      config.maxMissFrames > 0
      && missCount <= config.maxMissFrames
      && track.lastMatchIou >= config.unlockIouMin
      && detectionConfidence(track.detection) >= config.minConfidence

    if (canCoast) {
      const decay = Math.max(0.35, 1 - missCount * 0.12)
      const [vx, vy] = track.velocity ?? [0, 0]
      const predicted = shiftBbox(track.smoothedBbox, vx * decay, vy * decay)
      const velocity: [number, number] = [vx * 0.92, vy * 0.92]
      nextTracks.set(trackId, {
        ...track,
        missCount,
        smoothedBbox: predicted,
        detection: { ...track.detection, bbox: predicted },
        velocity,
      })
      output.push({
        ...track.detection,
        bbox: predicted,
        trackId,
        trackLocked: track.locked,
        trackScore: track.lastMatchIou,
      })
      continue
    }
  }

  detections.forEach((det, detIndex) => {
    if (usedDets.has(detIndex)) return
    if (detectionConfidence(det) < config.minConfidence) return
    const id = nextTrackId(det.behavior)
    nextTracks.set(id, {
      id,
      detection: det,
      smoothedBbox: [...det.bbox],
      missCount: 0,
      lastMatchIou: 1,
      locked: false,
      velocity: [0, 0],
    })
    output.push({
      ...det,
      trackId: id,
      trackLocked: false,
      trackScore: 1,
    })
  })

  return { tracks: nextTracks, output }
}
