import type { KalmanBox2D } from './kalmanBox2d'

export type Bbox = [number, number, number, number]

export type PersonRoiTrackState = 'tentative' | 'confirmed' | 'lost'

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
  subjectBbox?: Bbox
  /** Khoá theo track BE — ưu tiên hơn IoU khi bodycam rung/xoay. */
  anchorKey?: string
  kalman: KalmanBox2D
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
  subjectBbox?: Bbox
}
