/**
 * Patrol Person ROI — tham số tracker (ByteTrack / SORT inspired).
 * Tách khỏi ATLĐ `bboxTrackLock` — chỉ dùng Module 05 bodycam / patrol VMS.
 * HC-02 analyze qua HTTP ~180–400ms/frame; bodycam rung nên ưu tiên khoá theo
 * track id backend, IoU chỉ là phương án dự phòng.
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
  confirmHits: 2,
  /** IoU tối thiểu match track ↔ detection */
  matchIouMin: 0.10,
  /** Match theo khoảng cách tâm / kích thước bbox (di chuyển nhanh) */
  matchCenterRatio: 1.30,
  /**
   * Tỉ lệ diện tích nhỏ/lớn tối thiểu để hai hộp được coi là cùng một người.
   *
   * Không có cổng này thì trong cảnh đông, track của người đứng cận cảnh ghép
   * được với detection của người phía xa chỉ vì tâm hai hộp gần nhau — ROI nhảy
   * từ người này sang người kia mỗi nhịp analyze. Mirror `_size_ratio` của
   * `patrol_tracker.py`.
   */
  matchSizeRatioMin: 0.28,
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
   * 0 = ẩn ngay khi mất detection — tránh "bóng ROI" đứng yên sau khi người đi qua.
   */
  displayCoastMaxMiss: 0,
  /**
   * Quá ngần này mà track không được đo lại thì thôi vẽ, kể cả chưa kịp tính là
   * miss.
   *
   * `missStreak` chỉ tăng khi có nhịp `ingest` mới. Khi luồng detections đứt —
   * WebSocket rớt, worker VMS chết, tile chuyển sang nền — không còn nhịp nào
   * để đếm, nên hộp cuối cùng đứng nguyên trên video vô thời hạn. Đó chính là
   * loại "ROI ảo" khó chịu nhất: nó trông y như một ROI thật.
   */
  displayMaxStaleMs: 1500,
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
  /** EMA overlay — ingest snap (engine); glide = 1 để bbox bám kịp khi di chuyển */
  displayEmaAlpha: 1,
  displayEmaGlideAlpha: 1,
  /** Trần tốc độ theo số lần cạnh bbox mỗi giây */
  maxSpeedBoxPerSec: 7.5,
}

/**
 * Bodycam (HC-*) và flycam tầm thấp — người chiếm phần lớn khung, nhưng camera
 * đội đầu rung và xoay nhanh nên cổng ghép vẫn phải rộng.
 */
export const PATROL_PERSON_ROI_PROFILE_BODYCAM: PatrolPersonRoiConfig = {
  ...PATROL_PERSON_ROI_CONFIG,
  highConfidenceMin: 0.34,
  matchIouMin: 0.10,
  matchCenterRatio: 1.30,
  matchSizeRatioMin: 0.28,
  /**
   * VMS poll ~280ms + YOLO dao động — EMA=1 snap mỗi nhịp gây bbox nhảy loạn.
   * Local publisher (HC-02 /phat-song) dùng profile riêng mượt hơn nữa.
   */
  displayEmaAlpha: 0.78,
  displayEmaGlideAlpha: 0.86,
  maxPredictMs: 520,
  minMeasureGain: 0.90,
  anchoredMinMeasureGain: 0.88,
}

/**
 * HC-02 publish từ chính máy — analyze JPEG ~280–450ms sau khi chụp khung.
 * Snap EMA=1 gây bbox nhảy loạn mỗi nhịp response; làm mượt + hạn chế predict.
 */
export const PATROL_PERSON_ROI_PROFILE_LOCAL: PatrolPersonRoiConfig = {
  ...PATROL_PERSON_ROI_PROFILE_BODYCAM,
  displayEmaAlpha: 0.72,
  displayEmaGlideAlpha: 0.82,
  maxPredictMs: 480,
  minMeasureGain: 0.88,
  anchoredMinMeasureGain: 0.92,
}

/**
 * Flycam tầm cao (DR-* aerial) — người cao 1–2% khung hình. IoU giữa hai nhịp
 * thường bằng 0 ngay cả khi người đứng yên vì drone tự trôi, nên phải cho ghép
 * thuần theo khoảng cách tâm; bù lại siết tỉ lệ diện tích để không gộp nhầm hai
 * người khác cỡ.
 */
export const PATROL_PERSON_ROI_PROFILE_FLYCAM: PatrolPersonRoiConfig = {
  ...PATROL_PERSON_ROI_CONFIG,
  highConfidenceMin: 0.28,
  matchIouMin: 0.04,
  matchCenterRatio: 2.20,
  matchSizeRatioMin: 0.20,
}

/**
 * Chọn profile theo camera — mirror `profile_for_camera` của backend.
 *
 * Dùng chung một bộ tham số cho cả ba camera là gốc của cảnh ROI loạn trên
 * DR-03: ngưỡng vừa đủ cho người cận cảnh trên HC-01 thì quá chặt với người
 * 12px trên flycam, nên mỗi nhịp analyze lại đẻ ra một track mới.
 */
export function resolvePatrolPersonRoiConfig(
  cameraId: string,
  flightMode?: PatrolFlightMode | null,
  options?: { localPublisher?: boolean },
): PatrolPersonRoiConfig {
  if (options?.localPublisher && cameraId.startsWith('HC-')) {
    return PATROL_PERSON_ROI_PROFILE_LOCAL
  }
  if (cameraId.startsWith('DR-')) {
    return flightMode === 'proximity'
      ? PATROL_PERSON_ROI_PROFILE_BODYCAM
      : PATROL_PERSON_ROI_PROFILE_FLYCAM
  }
  if (cameraId.startsWith('HC-')) return PATROL_PERSON_ROI_PROFILE_BODYCAM
  return PATROL_PERSON_ROI_CONFIG
}
