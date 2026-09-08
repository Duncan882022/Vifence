/**
 * Patrol Person ROI — tham số tracker (ByteTrack / SORT inspired).
 * Tách khỏi ATLĐ `bboxTrackLock` — chỉ dùng Module 05 bodycam / patrol VMS.
 * Helmet UX: cover-or-hide — bbox đo cuối khi YOLO khóa, ẩn ngay khi miss, không coast/predict.
 */
import type { PatrolFlightMode } from '../utils/patrolFlightMode'

export interface PatrolPersonRoiConfig {
  birthMinConfidence: number
  highConfidenceMin: number
  confirmHits: number
  matchIouMin: number
  matchCenterRatio: number
  matchSizeRatioMin: number
  maxMissFrames: number
  displayCoastMaxMiss: number
  displayMaxStaleMs: number
  maxPredictMs: number
  maxPredictMsLost: number
  processNoise: number
  measureNoise: number
  minMeasureGain: number
  anchoredMinMeasureGain: number
  velocityDamping: number
  sizeGain: number
  velocitySmoothing: number
  displayEmaAlpha: number
  displayEmaGlideAlpha: number
  maxSpeedBoxPerSec: number
}

export const PATROL_PERSON_ROI_CONFIG: PatrolPersonRoiConfig = {
  birthMinConfidence: 0.15,
  highConfidenceMin: 0.28,
  confirmHits: 1,
  matchIouMin: 0.08,
  matchCenterRatio: 1.75,
  matchSizeRatioMin: 0.22,
  maxMissFrames: 14,
  displayCoastMaxMiss: 1,
  displayMaxStaleMs: 4500,
  maxPredictMs: 0,
  maxPredictMsLost: 0,
  processNoise: 0.05,
  measureNoise: 0.08,
  minMeasureGain: 1.0,
  anchoredMinMeasureGain: 1.0,
  velocityDamping: 0.996,
  sizeGain: 0.72,
  velocitySmoothing: 0.08,
  displayEmaAlpha: 1,
  displayEmaGlideAlpha: 1,
  maxSpeedBoxPerSec: 14,
}

/** Bodycam HC-* — cover-or-hide; conf thấp hơn vẫn vẽ khi có track_id BE. */
export const PATROL_PERSON_ROI_PROFILE_BODYCAM: PatrolPersonRoiConfig = {
  ...PATROL_PERSON_ROI_CONFIG,
  highConfidenceMin: 0.26,
}

/** WHEP/WebRTC — cùng cover-or-hide. */
export const PATROL_PERSON_ROI_PROFILE_BODYCAM_WHEP: PatrolPersonRoiConfig = {
  ...PATROL_PERSON_ROI_PROFILE_BODYCAM,
  matchCenterRatio: 1.85,
}

/** HC-02 publish local — cùng cover-or-hide; analyze JPEG trễ hơn WHEP một chút. */
export const PATROL_PERSON_ROI_PROFILE_LOCAL: PatrolPersonRoiConfig = {
  ...PATROL_PERSON_ROI_PROFILE_BODYCAM,
}

/** Flycam tầm cao (DR-* aerial). */
export const PATROL_PERSON_ROI_PROFILE_FLYCAM: PatrolPersonRoiConfig = {
  ...PATROL_PERSON_ROI_CONFIG,
  highConfidenceMin: 0.26,
  matchIouMin: 0.04,
  matchCenterRatio: 2.20,
  matchSizeRatioMin: 0.18,
  displayCoastMaxMiss: 1,
  maxMissFrames: 10,
}

export function resolvePatrolPersonRoiConfig(
  cameraId: string,
  flightMode?: PatrolFlightMode | null,
  options?: { localPublisher?: boolean; lowLatencyLive?: boolean },
): PatrolPersonRoiConfig {
  if (options?.localPublisher && cameraId.startsWith('HC-')) {
    return PATROL_PERSON_ROI_PROFILE_LOCAL
  }
  if (cameraId.startsWith('DR-')) {
    return flightMode === 'proximity'
      ? PATROL_PERSON_ROI_PROFILE_BODYCAM
      : PATROL_PERSON_ROI_PROFILE_FLYCAM
  }
  if (cameraId.startsWith('HC-')) {
    return options?.lowLatencyLive
      ? PATROL_PERSON_ROI_PROFILE_BODYCAM_WHEP
      : PATROL_PERSON_ROI_PROFILE_BODYCAM
  }
  return PATROL_PERSON_ROI_CONFIG
}
