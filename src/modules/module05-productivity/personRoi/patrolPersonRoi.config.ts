/**
 * Patrol Person ROI — tham số tracker (ByteTrack / SORT inspired).
 * Tách khỏi ATLĐ `bboxTrackLock` — chỉ dùng Module 05 bodycam / patrol VMS.
 * HC-02 analyze qua HTTP ~180–400ms/frame; bodycam rung nên ưu tiên khoá theo
 * track id backend, IoU chỉ là phương án dự phòng.
 */
export const PATROL_PERSON_ROI_CONFIG = {
  /**
   * Sàn conf để vẽ ROI. Backend đã lọc hai lớp (gate hiển thị + xác nhận track),
   * nên đây chỉ là lưới an toàn cho detection không mang track id.
   *
   * Giữ 0.28 như trước là chặn mất chính flycam: DR-* nhận người từ 0.18 vì
   * người trên không chỉ cao 1–2% khung, nên phần lớn box hợp lệ nằm dưới ngưỡng
   * và không bao giờ được vẽ.
   */
  birthMinConfidence: 0.15,
  /** Conf cao — ưu tiên gán trước (ByteTrack high-conf pool) */
  highConfidenceMin: 0.30,
  /** Số hit liên tiếp để confirmed — detection có track id BE confirm ngay */
  confirmHits: 1,
  /** IoU tối thiểu match track ↔ detection */
  matchIouMin: 0.07,
  /** Match theo khoảng cách tâm / kích thước bbox (di chuyển nhanh) */
  matchCenterRatio: 0.9,
  /**
   * Frame analyze miss liên tiếp trước khi bỏ hẳn track khỏi bộ nhớ.
   *
   * Track mất dấu **không được vẽ** (xem `predictPersonRoiTracks`), nhưng vẫn
   * giữ trong bộ nhớ ngần này nhịp để người bị che thoáng qua rồi hiện lại
   * nhận lại đúng track cũ thay vì bị cấp mã mới.
   */
  maxMissFrames: 5,
  /**
   * Số nhịp analyze miss vẫn vẽ ROI (chỉ mờ dần).
   * 1 = cho phép miss 1 nhịp (che thoáng / jitter YOLO), ẩn từ nhịp thứ 2.
   */
  displayCoastMaxMiss: 1,
  /**
   * Trần nội suy rAF (ms) khi track còn bám — mượt giữa hai lần analyze ~90–150ms.
   */
  maxPredictMs: 880,
  /**
   * Khi mất dấu (missStreak > 0): không trượt bbox — giữ tại vị trí đo cuối.
   * Tránh ghost ROI lơ lửng / trượt ra khỏi khung sau khi người đã rời cam.
   */
  maxPredictMsLost: 0,
  /** Kalman — processNoise chỉ cộng vào lúc coast (track đang mất dấu). */
  processNoise: 0.05,
  measureNoise: 0.08,
  /**
   * Sàn hệ số lọc: mỗi lần đo, tâm box phải tiến ít nhất ngần này quãng đường
   * tới vị trí vừa đo được.
   *
   * Track đang bám chỉ chạy `update`, không chạy `predict`, nên `p` giảm đơn
   * điệu tới sàn và hệ số rơi về ~0.2: mỗi nhịp ROI chỉ đi được 1/5 quãng, box
   * bám lệt bệt sau người và càng đi nhanh càng tụt. Có sàn thì độ trễ bị chặn.
   */
  minMeasureGain: 0.98,
  /**
   * Track đã khoá theo track id backend — bám sát measurement, ít trailing.
   */
  anchoredMinMeasureGain: 1.0,
  velocityDamping: 0.996,
  /** Trọng số đo trên kích thước — cao hơn để box theo người nhanh hơn */
  sizeGain: 0.62,
  /** Giữ lại bao nhiêu vận tốc cũ mỗi lần đo — thấp = phản ứng nhanh hơn */
  velocitySmoothing: 0.22,
  /** EMA overlay — ingest snap (engine); glide giữa hai lần analyze */
  displayEmaAlpha: 1,
  displayEmaGlideAlpha: 0.94,
  /** Trần tốc độ theo số lần cạnh bbox mỗi giây */
  maxSpeedBoxPerSec: 7.5,
} as const

export type PatrolPersonRoiConfig = typeof PATROL_PERSON_ROI_CONFIG
