/**
 * Patrol Person ROI — tham số tracker (ByteTrack / SORT inspired).
 * Tách khỏi ATLĐ `bboxTrackLock` — chỉ dùng Module 05 bodycam / patrol VMS.
 * HC-02 analyze qua HTTP ~220ms/frame → Kalman coast dài hơn để ROI mượt.
 */
export const PATROL_PERSON_ROI_CONFIG = {
  /** Conf tối thiểu tạo track + vẽ ROI — khớp HC02_PERSON_MIN_CONF (0.35) */
  birthMinConfidence: 0.33,
  /** Conf cao — ưu tiên gán trước (ByteTrack high-conf pool) */
  highConfidenceMin: 0.36,
  /** Số hit liên tiếp để confirmed */
  confirmHits: 1,
  /** IoU tối thiểu match track ↔ detection */
  matchIouMin: 0.07,
  /** Match theo khoảng cách tâm / kích thước bbox (di chuyển nhanh) */
  matchCenterRatio: 0.65,
  /** Frame analyze miss liên tiếp trước khi chuyển lost */
  maxMissFrames: 30,
  /** Thời gian coast sau lost (ms) — Kalman predict trên overlay, tăng để smooth qua latency mạng */
  maxLostMs: 5600,
  /** Giới hạn extrapolate rAF (ms) — cao hơn để mượt khi round-trip chậm */
  maxPredictMs: 2600,
  /** Kalman — processNoise thấp → track ổn định hơn giữa 2 detect */
  processNoise: 0.08,
  measureNoise: 0.20,
  velocityDamping: 0.978,
} as const

export type PatrolPersonRoiConfig = typeof PATROL_PERSON_ROI_CONFIG
