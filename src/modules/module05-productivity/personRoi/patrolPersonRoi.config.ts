/**
 * Patrol Person ROI — tham số tracker (ByteTrack / SORT inspired).
 * Tách khỏi ATLĐ `bboxTrackLock` — chỉ dùng Module 05 bodycam / patrol VMS.
 * HC-02 analyze qua HTTP ~180–400ms/frame; bodycam rung nên ưu tiên khoá theo
 * track id backend, IoU chỉ là phương án dự phòng.
 */
export const PATROL_PERSON_ROI_CONFIG = {
  /** Conf tối thiểu tạo track + vẽ ROI — khớp HC02_PERSON_MIN_CONF (0.30) */
  birthMinConfidence: 0.28,
  /** Conf cao — ưu tiên gán trước (ByteTrack high-conf pool) */
  highConfidenceMin: 0.34,
  /** Số hit liên tiếp để confirmed — detection có track id BE confirm ngay */
  confirmHits: 2,
  /** IoU tối thiểu match track ↔ detection */
  matchIouMin: 0.07,
  /** Match theo khoảng cách tâm / kích thước bbox (di chuyển nhanh) */
  matchCenterRatio: 0.9,
  /** Frame analyze miss liên tiếp trước khi bỏ track */
  maxMissFrames: 8,
  /** Thời gian coast sau lost (ms) — quá dài sẽ để lại bbox ma trên khung */
  maxLostMs: 1200,
  /** Giới hạn extrapolate rAF (ms) — chỉ bù đúng một nhịp analyze */
  maxPredictMs: 260,
  /** Kalman — processNoise thấp → track ổn định hơn giữa 2 detect */
  processNoise: 0.08,
  measureNoise: 0.2,
  velocityDamping: 0.978,
  /** Trọng số đo trên kích thước — thấp thì ROI không phình/co giật theo YOLO */
  sizeGain: 0.35,
  /** Giữ lại bao nhiêu vận tốc cũ mỗi lần đo */
  velocitySmoothing: 0.72,
  /** Trần tốc độ theo số lần cạnh bbox mỗi giây */
  maxSpeedBoxPerSec: 2.5,
} as const

export type PatrolPersonRoiConfig = typeof PATROL_PERSON_ROI_CONFIG
