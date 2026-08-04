/** Module 04 — Housekeeping & Logistics AI monitoring */

export type HousekeepingAiGroupId = 'LOG' | 'HK'

export type HousekeepingRoiType = 'ROAD' | 'BUFFER' | 'STORAGE' | 'MESH'

export type HousekeepingAlertSeverity = 'WARNING' | 'VIOLATION' | 'CRITICAL'

export type HousekeepingEventStatus =
  | 'DETECTED'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'PENDING_RECHECK'
  | 'CLOSED'

export type HousekeepingEventSubjectType =
  | 'SITE_CONDITION'
  | 'CONSTRUCTION_ACTIVITY'
  | 'VEHICLE'

export interface HousekeepingAiGroup {
  id: HousekeepingAiGroupId
  name: string
  description: string
  icon: string
}

export interface HousekeepingAiScenario {
  id: string
  groupId: HousekeepingAiGroupId
  name: string
  description: string
  eventSubjectType: HousekeepingEventSubjectType
  defaultSeverity: HousekeepingAlertSeverity
  /** Thời gian tồn tại tối thiểu trước khi cảnh báo (phút). 0 = ngay lập tức. */
  dwellMinutes: number
  requiresRoadRoi: boolean
}

export interface HousekeepingRoiZone {
  id: string
  label: string
  type: HousekeepingRoiType
  /** Polygon tọa độ chuẩn hoá 0–1 trên khung camera */
  polygon: Array<{ x: number; y: number }>
  cameraId: string
  exemptFromOccupancy?: boolean
}

export interface HousekeepingAiConfig {
  roadOccupancyMinutes: number
  trashDwellMinutes: number
  mudThresholdPercent: number
  waterThresholdPercent: number
  checkIntervalSeconds: number
  snapshotEnabled: boolean
  playbackEnabled: boolean
  evidenceRetentionDays: number
}

export interface HousekeepingEventEvidence {
  fullFrameUrl?: string
  annotatedUrl?: string
  cropUrl?: string
  playbackUrl?: string
}

export interface HousekeepingEventRecord {
  id: string
  scenarioId: string
  groupId: HousekeepingAiGroupId
  zoneId: string
  roiType: HousekeepingRoiType
  sourceDeviceId: string
  detectedAt: string
  severity: HousekeepingAlertSeverity
  status: HousekeepingEventStatus
  confidence?: number
  eventSubjectType: HousekeepingEventSubjectType
  description?: string
  dwellMinutes?: number
  snapshotUrl?: string
  evidence?: HousekeepingEventEvidence
  assignedTo?: string
  closedAt?: string
}

export interface HousekeepingDashboardFilters {
  dateRange: 'today' | 'week' | 'month'
  groupId: HousekeepingAiGroupId | null
  scenarioId: string | null
  status: HousekeepingEventStatus | null
  roiType: HousekeepingRoiType | null
  searchQuery?: string
}

export interface LogisticsKpis {
  occupiedRoutes: number
  avgOccupancyMinutes: number
  topOccupancyLocation: string
  unhandledCount: number
}

export interface HousekeepingAiKpis {
  roadCleanlinessPercent: number
  mudAreaSqm: number
  waterAreaSqm: number
  trashLocations: number
  scatteredMaterialLocations: number
  unhandledCount: number
}

export interface HousekeepingDashboardKpis {
  logistics: LogisticsKpis
  housekeeping: HousekeepingAiKpis
  totalEvents: number
  closedCount: number
}

export interface HousekeepingGroupStats {
  groupId: HousekeepingAiGroupId
  total: number
  unhandled: number
  trend: number
  scenarioBreakdown: {
    scenarioId: string
    name: string
    count: number
    severity: HousekeepingAlertSeverity
  }[]
}
