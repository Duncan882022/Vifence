/** Module 03 — Safety Monitoring data model */

export type SafetyGroupId = 'PPE' | 'WAH' | 'DZ' | 'ATGT' | 'BPTC' | 'PCCC'

export type SafetyZoneType =
  | 'BUILDING'
  | 'ROAD'
  | 'INTERSECTION'
  | 'EXCAVATION'
  | 'LIFTING'
  | 'HOT_WORK'
  | 'WORK_AT_HEIGHT'

export type ZoneRiskLevel = 'NORMAL' | 'WARNING' | 'HIGH' | 'CRITICAL' | 'NO_DATA'

export type MonitoringMode =
  | 'CONTINUOUS'
  | 'EVENT_BASED'
  | 'SCHEDULED_PATROL'
  | 'PRE_WORK_INSPECTION'
  | 'CHANGE_DETECTION'
  | 'HYBRID'

export type MonitoringDeviceType =
  | 'FIXED_CAMERA'
  | 'PTZ_CAMERA'
  | 'DRONE'
  | 'DRONE_RTK'
  | 'BODY_CAMERA'
  | 'MOBILE'
  | 'RADAR'
  | 'GPS_IVI'
  | 'WEARABLE_SENSOR'
  | 'BIM_GIS'

export type DeviceRole = 'PRIMARY' | 'SUPPORT' | 'VERIFICATION'

export type DeviceStatus = 'ONLINE' | 'OFFLINE' | 'STANDBY' | 'IN_MISSION'

export type AutomationLevel = 'AUTOMATIC' | 'AI_ASSISTED' | 'HSE_VERIFICATION'

export type AlertSeverity = 'WARNING' | 'VIOLATION' | 'CRITICAL'

/** Loại đối tượng sự kiện — không mặc định mọi sự kiện là người vi phạm */
export type EventSubjectType =
  | 'PERSON'
  | 'VEHICLE'
  | 'SITE_CONDITION'
  | 'CONSTRUCTION_ACTIVITY'
  | 'MANAGEMENT'

export type ResponsibleUnitType =
  | 'CONTRACTOR'
  | 'CONSTRUCTION_TEAM'
  | 'SITE_MANAGEMENT'
  | 'HSE'

export type SafetyQuickFilter =
  | 'critical'
  | 'pending_verification'
  | 'overdue'
  | 'unassigned'
  | 'personal_violation'
  | 'management_alert'
  | 'drone_detected'
  | 'camera_detected'
  | 'bodycam_verification'

export type ViolationStatus =
  | 'DETECTED'
  | 'PENDING_VERIFICATION'
  | 'CONFIRMED'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'PENDING_RECHECK'
  | 'CLOSED'
  | 'OVERDUE'

export interface SafetyGroup {
  id: SafetyGroupId
  name: string
  description: string
  icon: string
}

export interface ScenarioDevice {
  type: MonitoringDeviceType
  role: DeviceRole
}

export interface SafetyScenario {
  id: string
  groupId: SafetyGroupId
  name: string
  description: string
  eventSubjectType: EventSubjectType
  monitoringModes: MonitoringMode[]
  automationLevel: AutomationLevel
  defaultSeverity: AlertSeverity
  devices: ScenarioDevice[]
}

export interface SafetyEventSubject {
  type: EventSubjectType
  /** Người lao động */
  workerId?: string
  workerName?: string
  employeeCode?: string
  contractorName?: string
  teamName?: string
  /** Phương tiện */
  vehiclePlate?: string
  vehicleType?: string
  driverName?: string
  /** Hiện trạng công trường */
  block?: string
  floor?: string
  workItem?: string
  siteContractor?: string
  /** Hoạt động thi công */
  workActivity?: string
  constructionUnit?: string
  supervisorName?: string
  /** Điều hành / tổ chức */
  managementUnit?: string
  responsibleRole?: string
  responsiblePerson?: string
  responsibleUnit?: ResponsibleUnitType
}

/** Mã khu vực hiện trường — khớp tab camera Module 03 (TTDV-A / TMDV-B / TMDV-C) */
export type SafetySiteCode = 'TTDV-A' | 'TMDV-B' | 'TMDV-C'

export interface SafetyZone {
  id: string
  name: string
  /** Mã khu vực trên sơ đồ camera — vd. TTDV-A */
  siteCode: SafetySiteCode
  type: SafetyZoneType
  projectId: string
  /** SVG polygon points for site map */
  mapShapeId?: string
  labelX?: number
  labelY?: number
  monitoringProfileIds: string[]
  deviceIds: string[]
  riskLevel: ZoneRiskLevel
}

export interface MonitoringProfile {
  id: string
  name: string
  groups: SafetyGroupId[]
  scenarios: string[]
}

export interface MonitoringDevice {
  id: string
  name: string
  type: MonitoringDeviceType
  status: DeviceStatus
  zoneIds: string[]
  coordinates?: { x: number; y: number }
}

export interface SafetyViolationRecord {
  id: string
  scenarioId: string
  groupId: SafetyGroupId
  zoneId: string
  sourceDeviceId: string
  sourceType: MonitoringDeviceType
  detectedAt: string
  severity: AlertSeverity
  status: ViolationStatus
  confidence?: number
  eventSubjectType: EventSubjectType
  subject: SafetyEventSubject
  assigneeId?: string
  dueAt?: string
  snapshotUrl?: string
  playbackUrl?: string
  /** Bbox vi phạm trên frame gốc [x1,y1,x2,y2] — zoom playback. */
  bbox?: [number, number, number, number]
  /** Bbox đối tượng (người/xe) — ưu tiên cho ROI playback. */
  subjectBbox?: [number, number, number, number]
  /** Bbox liên quan (máy cẩu DZ, v.v.) — snapshot/playback cặp riêng. */
  relatedBbox?: [number, number, number, number]
  frameWidth?: number
  frameHeight?: number
  /** Giây seek vào clip camera / demo. */
  playbackSeekSec?: number
  /** URL clip MP4 đã cắt sẵn từ VMS backend (ưu tiên hơn seek vào demo video). */
  clipUrl?: string
  /** Thời lượng clip (giây) — từ VMS backend. */
  clipDurationSec?: number
  verificationRequired: boolean
  description?: string
  /** Khóa dedup từ backend — cùng camera × kịch bản × đối tượng. */
  dedupKey?: string
  /** @deprecated dùng subject — giữ để tương thích adapter */
  contractorId?: string
  contractorName?: string
  workerId?: string
  workerName?: string
}

export interface SafetyDashboardFilters {
  projectId?: string
  zoneId?: string | null
  groupId?: SafetyGroupId | null
  scenarioId?: string | null
  status?: ViolationStatus | 'OPEN' | null
  dateRange?: 'today' | 'week' | 'month'
  searchQuery?: string
  quickFilter?: SafetyQuickFilter | null
  /** Bộ lọc nâng cao */
  eventSubjectType?: EventSubjectType | null
  deviceType?: MonitoringDeviceType | null
  responsibleUnit?: ResponsibleUnitType | null
  severity?: AlertSeverity | null
  advancedStatus?: ViolationStatus | null
  contractorId?: string | null
}

export interface SafetyDeviceTypeKpi {
  key: 'camera' | 'bodycam' | 'flycam'
  label: string
  active: number
  total: number
}

export interface SafetyDashboardKpis {
  monitoredZones: number
  cameraCount: number
  droneCount: number
  bodycamCount: number
  radarCount: number
  /** Tổng thiết bị đang hoạt động / tổng thiết bị giám sát */
  deviceActiveCount: number
  deviceTotalCount: number
  deviceBreakdown: SafetyDeviceTypeKpi[]
  todayViolations: number
  yesterdayViolations: number
  /** Thiết bị hôm qua — demo (trạng thái thiết bị không lưu lịch sử) */
  yesterdayDeviceActiveCount: number
  yesterdayDeviceTotalCount: number
  /** Xử lý hôm qua */
  yesterdayClosedCount: number
  yesterdayClosedRate: number
  /** Tổng vi phạm nhóm ATLĐ hôm qua */
  yesterdayGroupTotal: number
  /** Severity — Khẩn cấp → Vi phạm → Cảnh báo */
  criticalCount: number
  violationCount: number
  warningCount: number
  /** AI xử lý qua Loa — khẩn cấp */
  aiSpeakerHandledCount: number
  /** AI xử lý tự động — PPE + Hút thuốc */
  aiAutoHandledCount: number
  /** Đã xử lý thủ công — đồng bộ badge Cảnh báo */
  manualHandledCount: number
  /** Chưa xử lý — đồng bộ tab/filter Cảnh báo */
  unhandledCount: number
  /** Tổng đã xử lý (thủ công + AI) */
  handledTotalCount: number
  handledRate: number
  yesterdayHandledTotalCount: number
  yesterdayHandledRate: number
  /** Workflow (legacy — dashboard tier1 dùng handled* ở trên) */
  detectedCount: number
  pendingVerificationCount: number
  confirmedCount: number
  assignedCount: number
  inProgressCount: number
  pendingRecheckCount: number
  closedCount: number
  overdueCount: number
  nearDueCount: number
  openCount: number
  closedRate: number
}

export interface SafetyGroupStats {
  groupId: SafetyGroupId
  /** Tổng sự kiện hôm nay — cùng pool với panel Cảnh báo */
  total: number
  /** Severity — đồng bộ tab Cảnh báo */
  warning: number
  violation: number
  critical: number
  /** Workflow — chưa đóng */
  open: number
  trend: number
  scenarioBreakdown: { scenarioId: string; name: string; count: number; severity: AlertSeverity }[]
}

export interface SafetyWorkflowStats {
  detected: number
  pendingVerification: number
  confirmed: number
  assigned: number
  inProgress: number
  pendingRecheck: number
  closed: number
  overdue: number
  nearDue: number
  avgResolutionHours: number
  slaCloseRate: number
}
