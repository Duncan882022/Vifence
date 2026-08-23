import type { SafetyGroupId } from '@/modules/module03-safety/types/safety.types'

/** Pipeline AI gắn với camera — chọn trong cấu hình cam. */
export type CameraAiModelId =
  | 'face_demo'
  | 'road_material'
  | 'crane_proximity'
  | 'ppe'
  | 'patrol_person'
  | 'pccc'
  | 'wah'
  | 'atgt_traffic'
  | 'mobile_smoking_fire'

export type CameraAiOverlayKind = 'face' | 'road' | 'crane' | 'ppe' | 'patrol' | 'pccc' | 'wah' | 'atgt' | 'mobile'

export interface CameraAiVideoSegment {
  startSec: number
  endSec: number
}

export interface CameraAiRoiZone {
  id: string
  label: string
  type: string
  polygon: Array<{ x: number; y: number }>
  pixelsPerMeter?: number
  exemptFromOccupancy?: boolean
}

export interface CameraAiModelDefinition {
  id: CameraAiModelId
  label: string
  groupId: SafetyGroupId | 'DEMO'
  scenarioIds: string[]
  description: string
  needsPolygon: boolean
  polygonHint?: string
  endpoint?: string
  autoTrainTasks?: string[]
  overlayKind: CameraAiOverlayKind
  /** Mô tả đoạn demo trong clip (không gate runtime khi model bật). */
  videoSegments?: CameraAiVideoSegment[]
  /** Hiển thị trong listing — không bắt buộc có weights local. */
  modelVersion?: string
  modelMetric?: string
}

export interface CameraAiConfigRecord {
  enabledModels: CameraAiModelId[]
  /** Hiển thị polygon ROI trên live tile — mặc định theo camera (A-03 bật). */
  showLiveRoi?: boolean
}

export type CameraAiConfigMap = Record<string, CameraAiConfigRecord>
