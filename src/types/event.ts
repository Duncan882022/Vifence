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
  violationCategory?: string
  imageUrl?: string
  videoUrl?: string
  /** Playback sự kiện — cắt 3s quanh thời điểm vi phạm. */
  playbackSeekSec?: number
  clipDurationSec?: number
  violationBbox?: [number, number, number, number]
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
