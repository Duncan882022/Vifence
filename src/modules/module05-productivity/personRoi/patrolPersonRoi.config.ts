/**
 * Patrol Person ROI — tham số tracker (ByteTrack / SORT inspired).
 * Tách khỏi ATLĐ `bboxTrackLock` — chỉ dùng Module 05 bodycam / patrol VMS.
 */
export const PATROL_PERSON_ROI_CONFIG = {
  /** Conf tối thiểu tạo track mới */
  birthMinConfidence: 0.38,
  /** Conf cao — ưu tiên gán trước (ByteTrack high-conf pool) */
  highConfidenceMin: 0.48,
  /** Số hit liên tiếp để confirmed */
  confirmHits: 1,
  /** IoU tối thiểu match track ↔ detection */
  matchIouMin: 0.07,
  /** Match theo khoảng cách tâm / kích thước bbox (di chuyển nhanh) */
  matchCenterRatio: 0.52,
  /** Frame analyze miss liên tiếp trước khi chuyển lost */
  maxMissFrames: 10,
  /** Thời gian coast sau lost (ms) — Kalman predict trên overlay */
  maxLostMs: 1400,
  /** Giới hạn extrapolate rAF (ms) */
  maxPredictMs: 880,
  /** Kalman */
  processNoise: 0.12,
  measureNoise: 0.28,
  velocityDamping: 0.985,
} as const

export type PatrolPersonRoiConfig = typeof PATROL_PERSON_ROI_CONFIG
