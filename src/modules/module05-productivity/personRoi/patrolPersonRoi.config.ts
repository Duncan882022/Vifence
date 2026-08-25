/**
 * Patrol Person ROI — tham số tracker (ByteTrack / SORT inspired).
 * Tách khỏi ATLĐ `bboxTrackLock` — chỉ dùng Module 05 bodycam / patrol VMS.
 * HC-02 analyze qua HTTP ~220ms/frame → Kalman coast dài hơn để ROI mượt.
 */
export const PATROL_PERSON_ROI_CONFIG = {
  /** Conf tối thiểu tạo track + vẽ ROI — khớp HC02_PERSON_MIN_CONF (0.30) */
  birthMinConfidence: 0.28,
  /** Conf cao — ưu tiên gán trước (ByteTrack high-conf pool) */
  highConfidenceMin: 0.34,
  /** Số hit liên tiếp để confirmed */
  confirmHits: 1,
  /** IoU tối thiểu match track ↔ detection */
  matchIouMin: 0.07,
  /** Match theo khoảng cách tâm / kích thước bbox (di chuyển nhanh) */
  matchCenterRatio: 0.65,
  /** Frame analyze miss liên tiếp trước khi chuyển lost */
  maxMissFrames: 4,
  /**
   * Thời gian coast sau lost (ms).
   *
   * Mũ vừa quay là cảnh đổi hẳn, nên khung Kalman còn giữ vận tốc cũ sẽ trôi
   * sang chỗ không có ai — thà mất khung một nhịp còn hơn khoanh sai. Chỉ đủ
   * che một vài nhịp analyze bị rớt.
   */
  maxLostMs: 900,
  /** Giới hạn extrapolate rAF (ms) — vừa đủ mượt giữa hai nhịp analyze */
  maxPredictMs: 320,
  /** Kalman — processNoise thấp → track ổn định hơn giữa 2 detect */
  processNoise: 0.08,
  measureNoise: 0.20,
  velocityDamping: 0.978,
} as const

export type PatrolPersonRoiConfig = typeof PATROL_PERSON_ROI_CONFIG
