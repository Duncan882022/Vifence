export type CameraRecordType = 'continuous' | 'continuous_event' | 'event'

export interface CameraPlaybackRecord {
  id: string
  name: string
  startTime: string
  endTime: string
  type: CameraRecordType
  videoUrl?: string
  videoId?: string
  thumbnailUrl?: string
  /** Seconds into clip when selecting this event record */
  seekSec?: number
}

export interface CameraDetection {
  id: string
  label: string
  confidenceScore: number
  detectionResult?: string
  createdAt: string
}

export interface CameraPlaybackRecordsResponse {
  items: CameraPlaybackRecord[]
}

export interface CameraDetectionsResponse {
  items: CameraDetection[]
}
