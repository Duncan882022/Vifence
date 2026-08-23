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

  constructor(
    bbox: Bbox,
    private processNoise: number,
    private measureNoise: number,
    private velocityDamping: number,
  ) {
    const [cx, cy, w, h] = bboxToCxCyWh(bbox)
    this.cx = cx
    this.cy = cy
    this.vx = 0
    this.vy = 0
    this.w = w
    this.h = h
    this.p = 1
  }

  predict(dtMs: number): Bbox {
    const dt = Math.min(Math.max(dtMs, 0), 1200) / 1000
    this.cx += this.vx * dt
    this.cy += this.vy * dt
    this.vx *= this.velocityDamping
    this.vy *= this.velocityDamping
    this.p += this.processNoise * dt
    return this.getBbox()
  }

  /** Dự đoán cho hiển thị rAF — không mutate state. */
  getPredictedBbox(dtMs: number): Bbox {
    const dt = Math.min(Math.max(dtMs, 0), 1200) / 1000
    const cx = this.cx + this.vx * dt
    const cy = this.cy + this.vy * dt
    return cxCyWhToBbox(cx, cy, this.w, this.h)
  }

  update(bbox: Bbox, dtMs: number): Bbox {
    const [mx, my, mw, mh] = bboxToCxCyWh(bbox)
    const dt = Math.max(8, dtMs) / 1000
    const k = this.p / (this.p + this.measureNoise)

    const dx = mx - this.cx
    const dy = my - this.cy
    this.cx += k * dx
    this.cy += k * dy
    this.vx = this.vx * 0.35 + (dx / dt) * 0.65
    this.vy = this.vy * 0.35 + (dy / dt) * 0.65
    this.w = this.w * 0.25 + mw * 0.75
    this.h = this.h * 0.25 + mh * 0.75
    this.p = Math.max(0.05, (1 - k) * this.p)

    return this.getBbox()
  }

  getBbox(): Bbox {
    return cxCyWhToBbox(this.cx, this.cy, this.w, this.h)
  }
}
