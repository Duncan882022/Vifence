import type { Bbox } from './types'

function bboxToCxCyWh(b: Bbox): [number, number, number, number] {
  return [
    (b[0] + b[2]) / 2,
    (b[1] + b[3]) / 2,
    Math.max(1, b[2] - b[0]),
    Math.max(1, b[3] - b[1]),
  ]
}

function cxCyWhToBbox(cx: number, cy: number, w: number, h: number): Bbox {
  const hw = w / 2
  const hh = h / 2
  return [cx - hw, cy - hh, cx + hw, cy + hh]
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v))
}

export interface KalmanBox2DTuning {
  processNoise: number
  measureNoise: number
  velocityDamping: number
  /** Trọng số đo trên kích thước — thấp thì ROI không phình/co giật theo YOLO. */
  sizeGain: number
  /** Giữ lại bao nhiêu vận tốc cũ mỗi lần đo. */
  velocitySmoothing: number
  /** Trần tốc độ tính theo số lần cạnh bbox mỗi giây — chặn box bay khi đo nhiễu. */
  maxSpeedBoxPerSec: number
}

const DEFAULT_TUNING: KalmanBox2DTuning = {
  processNoise: 0.08,
  measureNoise: 0.2,
  velocityDamping: 0.978,
  sizeGain: 0.35,
  velocitySmoothing: 0.72,
  maxSpeedBoxPerSec: 2.5,
}

/**
 * Constant-velocity Kalman cho tâm bbox + EMA kích thước.
 * Mô hình chuẩn SORT/DeepSORT (2D position + velocity).
 */
export class KalmanBox2D {
  cx: number
  cy: number
  vx: number
  vy: number
  w: number
  h: number
  /** Position uncertainty (scalar) */
  p: number

  private tuning: KalmanBox2DTuning

  constructor(bbox: Bbox, tuning: Partial<KalmanBox2DTuning> = {}) {
    const [cx, cy, w, h] = bboxToCxCyWh(bbox)
    this.cx = cx
    this.cy = cy
    this.vx = 0
    this.vy = 0
    this.w = w
    this.h = h
    this.p = 1
    this.tuning = { ...DEFAULT_TUNING, ...tuning }
  }

  private maxSpeed(): number {
    return Math.max(this.w, this.h) * this.tuning.maxSpeedBoxPerSec
  }

  predict(dtMs: number): Bbox {
    const dt = clamp(dtMs, 0, 1200) / 1000
    this.cx += this.vx * dt
    this.cy += this.vy * dt
    this.vx *= this.tuning.velocityDamping
    this.vy *= this.tuning.velocityDamping
    this.p += this.tuning.processNoise * dt
    return this.getBbox()
  }

  /** Dự đoán cho hiển thị rAF — không mutate state. */
  getPredictedBbox(dtMs: number): Bbox {
    const dt = clamp(dtMs, 0, 1200) / 1000
    const cx = this.cx + this.vx * dt
    const cy = this.cy + this.vy * dt
    return cxCyWhToBbox(cx, cy, this.w, this.h)
  }

  update(bbox: Bbox, dtMs: number): Bbox {
    const [mx, my, mw, mh] = bboxToCxCyWh(bbox)
    const dt = Math.max(8, dtMs) / 1000
    const k = this.p / (this.p + this.tuning.measureNoise)

    const appliedX = k * (mx - this.cx)
    const appliedY = k * (my - this.cy)
    this.cx += appliedX
    this.cy += appliedY

    // Vận tốc lấy từ dịch chuyển đã lọc: innovation thô chia dt khuếch đại
    // nhiễu đo lên nhiều lần, kéo theo bbox bay khi extrapolate.
    const keep = this.tuning.velocitySmoothing
    const limit = this.maxSpeed()
    this.vx = clamp(this.vx * keep + (appliedX / dt) * (1 - keep), -limit, limit)
    this.vy = clamp(this.vy * keep + (appliedY / dt) * (1 - keep), -limit, limit)

    const sizeGain = this.tuning.sizeGain
    this.w = this.w * (1 - sizeGain) + mw * sizeGain
    this.h = this.h * (1 - sizeGain) + mh * sizeGain
    this.p = Math.max(0.05, (1 - k) * this.p)

    return this.getBbox()
  }

  /**
   * Nạp vận tốc backend đã ước lượng (px/giây).
   *
   * Track mới sinh ra với vận tốc 0 nên nhịp analyze đầu tiên ROI luôn tụt lại
   * sau người đang đi. Backend đã chạy Kalman trên chuỗi frame liên tục và biết
   * vận tốc thật ngay lúc đó — mồi lại rẻ hơn nhiều so với để FE tự đoán lại.
   */
  seedVelocity(vx: number, vy: number): void {
    const limit = this.maxSpeed()
    this.vx = clamp(vx, -limit, limit)
    this.vy = clamp(vy, -limit, limit)
  }

  getBbox(): Bbox {
    return cxCyWhToBbox(this.cx, this.cy, this.w, this.h)
  }
}
