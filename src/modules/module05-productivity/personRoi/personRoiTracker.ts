import { KalmanBox2D } from './kalmanBox2d'
import { suppressPatrolObjectOverlappingIdentified } from '../utils/patrolPersonVisibility'
import { PATROL_PERSON_ROI_CONFIG, type PatrolPersonRoiConfig } from './patrolPersonRoi.config'
import type {
  Bbox,
  PersonRoiDetection,
  PersonRoiDisplay,
  PersonRoiTier,
  PersonRoiTrack,
  PersonRoiTrackState,
} from './types'

const TIER_RANK: Record<PersonRoiTier, number> = {
  object: 0,
  person: 1,
  identity: 2,
}

let trackSeq = 0

function nextTrackId(): string {
  trackSeq += 1
  return `PTR-${String(trackSeq).padStart(5, '0')}`
}

/**
 * Chỉ nhận detection `person`.
 *
 * Module 05 chỉ dùng bbox người YOLO — không suy luận từ vật thể PPE (Module 03).
 * nhánh đó chỉ còn là đường cho dữ liệu lạ lọt vào — mà bbox một cái mũ thì
 * cũng không phải khung người để mà bám.
 */
export function normalizePersonRoiDetections(detections: PersonRoiDetection[]): PersonRoiDetection[] {
  return suppressPatrolObjectOverlappingIdentified(
    detections
      .filter(d => d.behavior === 'person' && (d.bbox?.length === 4 || d.subject_bbox?.length === 4))
      .map(d => ({
        ...d,
        // `bbox` là box hiển thị BE chốt; `subject_bbox` là YOLO gốc (sự kiện/debug).
        bbox: d.bbox?.length === 4
          ? d.bbox
          : (d.subject_bbox?.length === 4 ? d.subject_bbox : d.bbox!),
      })),
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

/** Tỉ lệ diện tích nhỏ/lớn — chặn ghép người cận cảnh với người phía xa. */
function sizeRatio(a: Bbox, b: Bbox): number {
  const areaA = Math.max(1, (a[2] - a[0]) * (a[3] - a[1]))
  const areaB = Math.max(1, (b[2] - b[0]) * (b[3] - b[1]))
  return Math.min(areaA, areaB) / Math.max(areaA, areaB)
}

function centerRatio(a: Bbox, b: Bbox): number {
  const ax = (a[0] + a[2]) / 2
  const ay = (a[1] + a[3]) / 2
  const bx = (b[0] + b[2]) / 2
  const by = (b[1] + b[3]) / 2
  const scale = Math.max(
    8,
    (Math.max(a[2] - a[0], a[3] - a[1]) + Math.max(b[2] - b[0], b[3] - b[1])) / 2,
  )
  return Math.hypot(ax - bx, ay - by) / scale
}

/**
 * Cùng cổng ghép với `_match_cost` của `patrol_tracker.py`.
 *
 * Điểm khác trước: nhánh khoảng cách tâm không còn đòi IoU tối thiểu. Với flycam
 * tầm cao, hai hộp của cùng một người ở hai nhịp liên tiếp thường không chồng
 * nhau chút nào, nên điều kiện IoU cũ khoá luôn nhánh này và mọi người trên DR-03
 * bị cấp track mới mỗi frame. Bù lại, `matchSizeRatioMin` mới chặn kiểu ghép
 * nhầm mà nhánh tâm dễ mắc nhất.
 */
function matchCost(trackBbox: Bbox, detBbox: Bbox, cfg: PatrolPersonRoiConfig): number | null {
  if (sizeRatio(trackBbox, detBbox) < cfg.matchSizeRatioMin) return null

  const iou = bboxIou(trackBbox, detBbox)
  if (iou >= cfg.matchIouMin) return 1 - iou

  const ratio = centerRatio(trackBbox, detBbox)
  if (ratio > cfg.matchCenterRatio) return null
  // Chồng lấn một phần → tin hơn hẳn trường hợp chỉ gần nhau.
  if (iou > 0) return 0.55 + 0.45 * (ratio / cfg.matchCenterRatio)
  if (ratio <= cfg.matchCenterRatio * 0.6) return 0.80 + 0.20 * (ratio / cfg.matchCenterRatio)
  return null
}

function isKnownWorker(id?: string): id is string {
  const s = (id ?? '').trim()
  if (!s || s === 'unknown') return false
  if (/^ptk/i.test(s) || /:person$/i.test(s)) return false
  return true
}

/**
 * Khoá ROI theo id ổn định của backend. Bodycam rung/xoay làm bbox giữa hai
 * lần analyze không còn chồng nhau, IoU trượt và track bị cấp id mới — id thì
 * không đổi nên bám đúng người.
 */
export function personRoiAnchorKey(det: PersonRoiDetection): string | undefined {
  const track = det.track_id?.trim()
  if (track) return `trk:${track}`
  const workerId = det.worker_id?.trim()
  if (isKnownWorker(workerId)) return `wid:${workerId}`
  return undefined
}

function createKalman(bbox: Bbox, cfg: PatrolPersonRoiConfig): KalmanBox2D {
  return new KalmanBox2D(bbox, {
    processNoise: cfg.processNoise,
    measureNoise: cfg.measureNoise,
    velocityDamping: cfg.velocityDamping,
    sizeGain: cfg.sizeGain,
    velocitySmoothing: cfg.velocitySmoothing,
    maxSpeedBoxPerSec: cfg.maxSpeedBoxPerSec,
    minMeasureGain: cfg.minMeasureGain,
    anchoredMinMeasureGain: cfg.anchoredMinMeasureGain,
  })
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
  excludeTrackIds: Set<string>,
): Map<string, number> {
  const detAnchors = detections.map(personRoiAnchorKey)
  const pairs: MatchPair[] = []
  for (const track of tracks) {
    if (!allowedStates.has(track.state)) continue
    if (excludeTrackIds.has(track.id)) continue
    const tb = track.kalman.getBbox()
    detections.forEach((det, detIndex) => {
      // Backend là nguồn sự thật về danh tính track. Hai bên đều mang id mà id
      // khác nhau thì đây chắc chắn là hai người khác nhau — dù hộp có chồng
      // nhau đến đâu. Cho phép ghép ở đây là để ROI (và mã `sgc-*` đi kèm) nhảy
      // sang người bên cạnh mỗi khi đám đông chen nhau.
      const detAnchor = detAnchors[detIndex]
      if (track.anchorKey && detAnchor && track.anchorKey !== detAnchor) return
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
  const anchor = personRoiAnchorKey(det)
  if (anchor) track.anchorKey = anchor
  if (isKnownWorker(det.worker_id)) {
    track.workerId = det.worker_id!.trim()
    const name = det.worker_name?.trim()
    if (name && name.toLowerCase() !== 'unknown') {
      track.workerName = name
    }
  }
  // Tầng do backend giữ (state machine chỉ tiến không lùi). FE chỉ chấp nhận
  // giá trị cao hơn để một payload trễ nhịp không kéo nhãn tụt xuống.
  if (det.tier && TIER_RANK[det.tier] > TIER_RANK[track.tier]) {
    track.tier = det.tier
  }
  if (det.peak_group) {
    track.peakGroup = true
    if (det.peak_group_index != null) track.peakGroupIndex = det.peak_group_index
    if (det.peak_group_size != null) track.peakGroupSize = det.peak_group_size
  }
  // Chỉ bật, không tắt: một payload thiếu cờ không được xoá dấu đã thăng hạng.
  if (det.promoted_from_object) track.promotedFromObject = true
  const detLabel = det.label?.trim()
  if (det.peak_group && detLabel?.startsWith('#')) {
    track.label = detLabel
  } else {
    track.label = track.workerName?.trim()
      || (isKnownWorker(track.workerId) ? track.workerId! : track.label)
  }
  // Suy giảm rồi mới lấy max, giống backend. Dùng thẳng `Math.max` thì con số
  // trên nhãn là **đỉnh của cả đời track** và không bao giờ hạ: người rời khung
  // rồi mà ROI vẫn khoe 93% của mấy giây trước, khiến một track đang yếu trông
  // như bằng chứng chắc chắn.
  track.confidence = Math.max(track.confidence * 0.6, det.confidence)
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

  const applyMeasurement = (track: PersonRoiTrack, det: PersonRoiDetection) => {
    const anchorKey = personRoiAnchorKey(det) ?? track.anchorKey
    const gainOverride = anchorKey ? cfg.anchoredMinMeasureGain : undefined
    track.kalman.update(det.bbox, dtMs, gainOverride)
    // Backend ước lượng vận tốc trên chuỗi frame liên tục với dt đều; FE chỉ có
    // nhịp snapshot tới nơi, vốn dao động theo mạng. Có số của backend thì dùng.
    if (det.velocity && det.velocity.length >= 2) {
      track.kalman.seedVelocity(det.velocity[0], det.velocity[1])
    }
    track.hits += 1
    track.missStreak = 0
    track.lastSeenAt = now
    track.lastMeasureAt = now
    applyIdentity(track, det)
    if (track.state === 'lost') {
      track.state = 'confirmed'
    } else if (
      track.state === 'tentative'
      && (track.hits >= cfg.confirmHits || Boolean(track.anchorKey))
    ) {
      track.state = 'confirmed'
    }
  }

  // 0) Khoá theo track id backend — chạy trước IoU vì bodycam rung làm bbox trượt.
  const byAnchor = new Map<string, PersonRoiTrack>()
  for (const track of trackList) {
    if (track.anchorKey) byAnchor.set(track.anchorKey, track)
  }
  const indexed = [
    ...high.map((det, index) => ({ det, globalIndex: index })),
    ...low.map((det, index) => ({ det, globalIndex: high.length + index })),
  ]
  for (const { det, globalIndex } of indexed) {
    const key = personRoiAnchorKey(det)
    if (!key) continue
    const track = byAnchor.get(key)
    if (!track || next.has(track.id)) continue
    applyMeasurement(track, det)
    matchedDets.add(globalIndex)
    next.set(track.id, track)
  }

  const assignPool = (
    pool: PersonRoiDetection[],
    states: PersonRoiTrackState[],
    offset = 0,
  ) => {
    // Bỏ sẵn detection đã bị bước khoá-theo-id tiêu thụ. Trước đây chúng vẫn nằm
    // trong bảng chi phí và có thể chiếm chỗ tốt nhất của một track khác, để rồi
    // bị loại ở vòng dưới — track đó mất lượt ghép và tính là miss dù có
    // detection hợp lệ ngay bên cạnh.
    const candidates = pool
      .map((det, index) => ({ det, globalIndex: offset + index }))
      .filter(entry => !matchedDets.has(entry.globalIndex))
    if (candidates.length === 0) return

    const assignment = greedyAssign(
      trackList,
      candidates.map(entry => entry.det),
      cfg,
      new Set(states),
      new Set(next.keys()),
    )
    for (const [trackId, detIndex] of assignment) {
      const track = prevTracks.get(trackId)
      const entry = candidates[detIndex]
      if (!track || !entry) continue
      matchedDets.add(entry.globalIndex)
      applyMeasurement(track, entry.det)
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
      // Không predict Kalman khi miss — bbox đứng tại chỗ đo cuối, tắt nhanh hơn khi rời cam.
      track.missStreak = missStreak
      track.state = track.state === 'tentative' ? 'tentative' : 'lost'
      track.lastSeenAt = now
      next.set(track.id, track)
      continue
    }
    // Drop track
  }

  // Detection chưa ghép → track mới. Có track id BE thì confirmed ngay để ROI
  // hiện từ frame đầu; không có thì chờ đủ confirmHits cho khỏi nhấp nháy.
  const birth = (det: PersonRoiDetection) => {
    if (det.confidence < cfg.birthMinConfidence) return
    const id = nextTrackId()
    const anchorKey = personRoiAnchorKey(det)
    const kalman = createKalman(det.bbox, cfg)
    // Không mồi vận tốc thì nhịp analyze đầu tiên ROI luôn đứng yên trong khi
    // người đã đi tiếp — thấy rõ nhất lúc người vừa bước vào khung.
    if (det.velocity && det.velocity.length >= 2) {
      kalman.seedVelocity(det.velocity[0], det.velocity[1])
    }
    const track: PersonRoiTrack = {
      id,
      state: anchorKey ? 'confirmed' : 'tentative',
      hits: 1,
      missStreak: 0,
      lastSeenAt: now,
      lastMeasureAt: now,
      confidence: det.confidence,
      label: det.worker_name?.trim() || det.label || id,
      workerId: isKnownWorker(det.worker_id) ? det.worker_id!.trim() : undefined,
      workerName: det.worker_name?.trim(),
      anchorKey,
      tier: det.tier ?? 'object',
      kalman,
      peakGroup: det.peak_group,
      peakGroupIndex: det.peak_group_index,
      peakGroupSize: det.peak_group_size,
      promotedFromObject: det.promoted_from_object,
    }
    applyIdentity(track, det)
    next.set(id, track)
  }

  high.forEach((det, index) => {
    if (matchedDets.has(index)) return
    birth(det)
  })

  // Low-conf — distant crowd / partial body (ByteTrack birth extension)
  low.forEach((det, index) => {
    if (matchedDets.has(high.length + index)) return
    birth(det)
  })

  return next
}

export function predictPersonRoiTracks(
  tracks: Map<string, PersonRoiTrack>,
  elapsedMs: number,
  cfg: PatrolPersonRoiConfig = PATROL_PERSON_ROI_CONFIG,
): PersonRoiDisplay[] {
  const out: PersonRoiDisplay[] = []

  for (const track of tracks.values()) {
    const coastLimit = cfg.displayCoastMaxMiss
    if (track.missStreak > coastLimit) {
      continue
    }
    // Conf thấp, backend chưa cấp id, và mới chỉ thấy đúng một lần: gần như luôn
    // là một mảng nhiễu. Chờ thêm một nhịp rẻ hơn nhiều so với một cái hộp chớp
    // lên rồi tắt giữa cảnh đông. Người rõ mặt (conf cao) vẫn vẽ ngay.
    if (
      !track.anchorKey
      && track.hits < cfg.confirmHits
      && track.confidence < cfg.highConfidenceMin
    ) {
      continue
    }

    const isCoasting = track.missStreak > 0
    const predictCap = isCoasting
      ? (cfg.maxPredictMsLost ?? 0)
      : cfg.maxPredictMs
    const dt = Math.min(Math.max(elapsedMs, 0), predictCap)
    const bbox = !isCoasting && dt > 0
      ? track.kalman.getPredictedBbox(dt)
      : track.kalman.getBbox()
    const personId = canonicalPersonId(track)

    let displayOpacity = 1
    if (track.missStreak > 0) {
      displayOpacity = Math.max(0.35, 1 - track.missStreak / (coastLimit + 1))
    } else if (track.state === 'tentative') {
      displayOpacity = 0.62
    }

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
      tier: track.tier,
      displayOpacity,
      peakGroup: track.peakGroup,
      peakGroupIndex: track.peakGroupIndex,
      peakGroupSize: track.peakGroupSize,
      promotedFromObject: track.promotedFromObject,
    })
  }

  return out
}

export function resetPersonRoiTrackSeq(): void {
  trackSeq = 0
}
