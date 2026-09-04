import type { KalmanBox2D } from './kalmanBox2d'

export type Bbox = [number, number, number, number]

export type PersonRoiTrackState = 'tentative' | 'confirmed' | 'lost'

/**
 * Tầng định danh — backend quyết, FE không suy lại.
 * `object` Đối tượng · `person` Người · `identity` Định danh.
 */
export type PersonRoiTier = 'object' | 'person' | 'identity'

/** Detection đầu vào từ backend analyze. */
export interface PersonRoiDetection {
  behavior: string
  label: string
  confidence: number
  bbox: Bbox
  subject_bbox?: Bbox
  worker_id?: string
  worker_name?: string
  /** Track ổn định phía BE — khoá ROI theo id này thay vì đoán lại bằng IoU. */
  track_id?: string
  face_eligible?: boolean
  /** Tầng đã ổn định của track (chỉ tiến không lùi) — nhãn lấy thẳng từ đây. */
  tier?: PersonRoiTier
  /** px/giây theo hệ toạ độ frame AI — mồi vận tốc Kalman ngay từ frame đầu. */
  velocity?: [number, number]
  peak_group?: boolean
  peak_group_index?: number
  peak_group_size?: number
}

/** Track nội bộ — Kalman + lifecycle. */
export interface PersonRoiTrack {
  id: string
  state: PersonRoiTrackState
  hits: number
  missStreak: number
  lastSeenAt: number
  lastMeasureAt: number
  confidence: number
  label: string
  workerId?: string
  workerName?: string
  /** Khoá theo track BE — ưu tiên hơn IoU khi bodycam rung/xoay. */
  anchorKey?: string
  tier: PersonRoiTier
  kalman: KalmanBox2D
  peakGroup?: boolean
  peakGroupIndex?: number
  peakGroupSize?: number
  /** Thẻ vốn là `obj-*`, lên hạng khi bắt được mặt — đánh dấu trên nhãn ROI. */
  promotedFromObject?: boolean
}

/** Output hiển thị overlay / heatmap. */
export interface PersonRoiDisplay {
  trackId: string
  personId: string
  label: string
  confidence: number
  bbox: Bbox
  state: PersonRoiTrackState
  locked: boolean
  workerId?: string
  workerName?: string
  tier: PersonRoiTier
  /** 0–1 — mờ dần khi track coast / tentative */
  displayOpacity: number
  peakGroup?: boolean
  peakGroupIndex?: number
  peakGroupSize?: number
  /** Thẻ vốn là `obj-*`, lên hạng khi bắt được mặt — đánh dấu trên nhãn ROI. */
  promotedFromObject?: boolean
}
