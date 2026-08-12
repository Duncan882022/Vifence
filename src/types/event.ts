export type EventStatus = 'pending' | 'processed' | 'dismissed'
export type EventSeverity = 'critical' | 'warning' | 'info'
export type EventModule = 'access-control' | 'training' | 'safety' | 'housekeeping' | 'productivity'

export interface Event {
  id: string
  type: string
  description: string
  timestamp: string
  cameraId: string
  cameraName: string
  location: string
  workerId?: string
  workerName?: string
  contractorName?: string
  vehiclePlate?: string
  vehicleType?: string
  trafficRole?: string
  trafficSubject?: string
  scenario?: string
  /** Mã kịch bản ATLĐ (ATGT-004, BPTC-001, …) — dùng styling ROI playback. */
  scenarioId?: string
  violationCategory?: string
  imageUrl?: string
  videoUrl?: string
  /** URL clip MP4 VMS (ưu tiên hơn videoUrl + seek). */
  clipUrl?: string
  /** Playback sự kiện — cắt 3s quanh thời điểm vi phạm. */
  playbackSeekSec?: number
  clipDurationSec?: number
  violationBbox?: [number, number, number, number]
  /** Người vi phạm — khung ROI phụ (PPE/DZ/WAH). */
  subjectBbox?: [number, number, number, number]
  /** Máy/đối tượng liên quan — khung ROI phụ (DZ). */
  relatedBbox?: [number, number, number, number]
  frameWidth?: number
  frameHeight?: number
  status: EventStatus
  severity: EventSeverity
  module: EventModule
}

export interface EventFilter {
  module?: EventModule
  status?: EventStatus
  severity?: EventSeverity
  dateFrom?: string
  dateTo?: string
  contractorId?: string
  search?: string
}
