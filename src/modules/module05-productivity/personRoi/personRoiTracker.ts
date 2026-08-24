import { KalmanBox2D } from './kalmanBox2d'
import { PATROL_PERSON_ROI_CONFIG, type PatrolPersonRoiConfig } from './patrolPersonRoi.config'
import type {
  Bbox,
  PersonRoiDetection,
  PersonRoiDisplay,
  PersonRoiTrack,
  PersonRoiTrackState,
} from './types'

const PPE_PROXY_BEHAVIORS = new Set([
  'no_helmet',
  'no_vest',
  'no_shoes',
  'hard_hat',
  'safety_vest',
  'safety_shoes',
])

let trackSeq = 0

function nextTrackId(): string {
  trackSeq += 1
  return `PTR-${String(trackSeq).padStart(5, '0')}`
}

export function normalizePersonRoiDetections(detections: PersonRoiDetection[]): PersonRoiDetection[] {
  const persons = detections.filter(d => d.behavior === 'person' && d.bbox?.length === 4)
  if (persons.length > 0) return dedupeOverlappingPersonDetections(persons)
  return dedupeOverlappingPersonDetections(
    detections
      .filter(d => PPE_PROXY_BEHAVIORS.has(d.behavior) && d.bbox?.length === 4)
      .map(d => ({ ...d, behavior: 'person' })),
  )
}

function bboxIou(a: Bbox, b: Bbox): number {
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

function bboxContainment(a: Bbox, b: Bbox): number {
  const ix1 = Math.max(a[0], b[0])
  const iy1 = Math.max(a[1], b[1])
  const ix2 = Math.min(a[2], b[2])
  const iy2 = Math.min(a[3], b[3])
  if (ix2 <= ix1 || iy2 <= iy1) return 0
  const inter = (ix2 - ix1) * (iy2 - iy1)
  const areaA = Math.max(0, a[2] - a[0]) * Math.max(0, a[3] - a[1])
  const areaB = Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1])
  const smaller = Math.min(areaA, areaB)
  return smaller > 0 ? inter / smaller : 0
}

function dedupeOverlappingPersonDetections(detections: PersonRoiDetection[]): PersonRoiDetection[] {
  if (detections.length <= 1) return detections
  const ranked = [...detections].sort((a, b) => {
    const areaA = Math.max(0, a.bbox[2] - a.bbox[0]) * Math.max(0, a.bbox[3] - a.bbox[1])
    const areaB = Math.max(0, b.bbox[2] - b.bbox[0]) * Math.max(0, b.bbox[3] - b.bbox[1])
    return areaB - areaA || b.confidence - a.confidence
  })
  const kept: PersonRoiDetection[] = []
  for (const candidate of ranked) {
    const duplicate = kept.some(
      keptDet =>
        bboxIou(candidate.bbox, keptDet.bbox) >= 0.48
        || bboxContainment(candidate.bbox, keptDet.bbox) >= 0.58,
    )
    if (!duplicate) kept.push(candidate)
  }
  return kept
}

function centerRatio(a: Bbox, b: Bbox): number {
  const ax = (a[0] + a[2]) / 2
  const ay = (a[1] + a[3]) / 2
  const bx = (b[0] + b[2]) / 2
  const by = (b[1] + b[3]) / 2
  const scale = Math.max(
    12,
    (Math.max(a[2] - a[0], a[3] - a[1]) + Math.max(b[2] - b[0], b[3] - b[1])) / 2,
  )
  return Math.hypot(ax - bx, ay - by) / scale
}

function matchCost(trackBbox: Bbox, detBbox: Bbox, cfg: PatrolPersonRoiConfig): number | null {
  const iou = bboxIou(trackBbox, detBbox)
  const center = centerRatio(trackBbox, detBbox)
  if (iou >= cfg.matchIouMin) return 1 - iou
  if (center <= cfg.matchCenterRatio && iou >= cfg.matchIouMin * 0.35) {
    return 0.55 + center * 0.45
  }
  return null
}

function isKnownWorker(id?: string): id is string {
  return Boolean(id && id.trim() && id !== 'unknown')
}

function canonicalPersonId(track: PersonRoiTrack): string {
  if (isKnownWorker(track.workerId)) return track.workerId!.trim()
  return track.id
}

interface MatchPair {
  trackId: string
  detIndex: number
  cost: number
}

function greedyAssign(
  tracks: PersonRoiTrack[],
  detections: PersonRoiDetection[],
  cfg: PatrolPersonRoiConfig,
  allowedStates: Set<PersonRoiTrackState>,
): Map<string, number> {
  const pairs: MatchPair[] = []
  for (const track of tracks) {
    if (!allowedStates.has(track.state)) continue
    const tb = track.kalman.getBbox()
    detections.forEach((det, detIndex) => {
      const cost = matchCost(tb, det.bbox, cfg)
      if (cost != null) pairs.push({ trackId: track.id, detIndex, cost })
    })
  }
  pairs.sort((a, b) => a.cost - b.cost)

  const assignment = new Map<string, number>()
  const usedTracks = new Set<string>()
  const usedDets = new Set<number>()
  for (const pair of pairs) {
    if (usedTracks.has(pair.trackId) || usedDets.has(pair.detIndex)) continue
    usedTracks.add(pair.trackId)
    usedDets.add(pair.detIndex)
    assignment.set(pair.trackId, pair.detIndex)
  }
  return assignment
}

function applyIdentity(track: PersonRoiTrack, det: PersonRoiDetection): void {
  if (det.subject_bbox && det.subject_bbox.length >= 4) {
    track.subjectBbox = det.subject_bbox
  }
  if (isKnownWorker(det.worker_id)) {
    track.workerId = det.worker_id!.trim()
    const name = det.worker_name?.trim()
    if (name && name.toLowerCase() !== 'unknown') {
      track.workerName = name
    }
  }
  track.label = track.workerName?.trim()
    || (isKnownWorker(track.workerId) ? track.workerId! : track.label)
  track.confidence = Math.max(track.confidence, det.confidence)
}

/**
 * ByteTrack-lite: high-conf pool → confirmed → lost → tentative → birth.
 */
export function advancePersonRoiTracks(
  prevTracks: Map<string, PersonRoiTrack>,
  rawDetections: PersonRoiDetection[],
  dtMs: number,
  now = Date.now(),
  cfg: PatrolPersonRoiConfig = PATROL_PERSON_ROI_CONFIG,
): Map<string, PersonRoiTrack> {
  const detections = normalizePersonRoiDetections(rawDetections)
  const high = detections.filter(d => d.confidence >= cfg.highConfidenceMin)
  const low = detections.filter(
    d => d.confidence >= cfg.birthMinConfidence && d.confidence < cfg.highConfidenceMin,
  )

  const trackList = [...prevTracks.values()]
  const next = new Map<string, PersonRoiTrack>()
  const matchedDets = new Set<number>()

  const assignPool = (
    pool: PersonRoiDetection[],
    states: PersonRoiTrackState[],
    offset = 0,
  ) => {
    const assignment = greedyAssign(trackList, pool, cfg, new Set(states))
    for (const [trackId, detIndex] of assignment) {
      const track = prevTracks.get(trackId)
      const det = pool[detIndex]
      if (!track || !det) continue
      const globalIndex = offset + detIndex
      if (matchedDets.has(globalIndex)) continue
      matchedDets.add(globalIndex)

      track.kalman.update(det.bbox, dtMs)
      track.hits += 1
      track.missStreak = 0
      track.lastSeenAt = now
      track.lastMeasureAt = now
      applyIdentity(track, det)
      if (track.state === 'tentative' && track.hits >= cfg.confirmHits) {
        track.state = 'confirmed'
      } else if (track.state === 'lost') {
        track.state = 'confirmed'
      }
      next.set(trackId, track)
    }
  }

  // 1) High conf → confirmed + lost
  assignPool(high, ['confirmed', 'lost'], 0)
  // 2) High conf → tentative
  assignPool(high, ['tentative'], 0)
  // 3) Low conf → confirmed only (ByteTrack second association)
  assignPool(low, ['confirmed'], high.length)

  // Unmatched tracks → miss / lost
  for (const track of trackList) {
    if (next.has(track.id)) continue
    const missStreak = track.missStreak + 1
    if (missStreak <= cfg.maxMissFrames) {
      track.kalman.predict(dtMs)
      track.missStreak = missStreak
      track.state = track.state === 'tentative' ? 'tentative' : 'lost'
      track.lastSeenAt = now
      next.set(track.id, track)
      continue
    }
    // Drop track
  }

  // Unmatched high-conf detections → new tentative tracks
  high.forEach((det, index) => {
    if (matchedDets.has(index)) return
    if (det.confidence < cfg.birthMinConfidence) return
    const id = nextTrackId()
    const kalman = new KalmanBox2D(
      det.bbox,
      cfg.processNoise,
      cfg.measureNoise,
      cfg.velocityDamping,
    )
    const track: PersonRoiTrack = {
      id,
      state: 'tentative',
      hits: 1,
      missStreak: 0,
      lastSeenAt: now,
      lastMeasureAt: now,
      confidence: det.confidence,
      label: det.worker_name?.trim() || det.label || id,
      workerId: isKnownWorker(det.worker_id) ? det.worker_id!.trim() : undefined,
      workerName: det.worker_name?.trim(),
      kalman,
    }
    applyIdentity(track, det)
    next.set(id, track)
  })

  // Unmatched low-conf — distant crowd / partial body (ByteTrack birth extension)
  low.forEach((det, index) => {
    const globalIndex = high.length + index
    if (matchedDets.has(globalIndex)) return
    if (det.confidence < cfg.birthMinConfidence) return
    const id = nextTrackId()
    const kalman = new KalmanBox2D(
      det.bbox,
      cfg.processNoise,
      cfg.measureNoise,
      cfg.velocityDamping,
    )
    const track: PersonRoiTrack = {
      id,
      state: 'tentative',
      hits: 1,
      missStreak: 0,
      lastSeenAt: now,
      lastMeasureAt: now,
      confidence: det.confidence,
      label: det.worker_name?.trim() || det.label || id,
      workerId: isKnownWorker(det.worker_id) ? det.worker_id!.trim() : undefined,
      workerName: det.worker_name?.trim(),
      kalman,
    }
    applyIdentity(track, det)
    next.set(id, track)
  })

  return next
}

export function predictPersonRoiTracks(
  tracks: Map<string, PersonRoiTrack>,
  elapsedMs: number,
  now = Date.now(),
  cfg: PatrolPersonRoiConfig = PATROL_PERSON_ROI_CONFIG,
): PersonRoiDisplay[] {
  const dt = Math.min(Math.max(elapsedMs, 0), cfg.maxPredictMs)
  const out: PersonRoiDisplay[] = []

  for (const track of tracks.values()) {
    const ageSinceMeasure = now - track.lastMeasureAt
    if (track.state === 'lost' && ageSinceMeasure > cfg.maxLostMs) continue
    if (track.state === 'tentative' && track.hits < cfg.confirmHits) continue

    const bbox = dt > 0 ? track.kalman.getPredictedBbox(dt) : track.kalman.getBbox()
    const personId = canonicalPersonId(track)
    out.push({
      trackId: track.id,
      personId,
      label: track.label,
      confidence: track.confidence,
      bbox,
      state: track.state,
      locked: track.state === 'confirmed',
      workerId: track.workerId,
      workerName: track.workerName,
      subjectBbox: track.subjectBbox,
    })
  }

  return out
}

export function resetPersonRoiTrackSeq(): void {
  trackSeq = 0
}
