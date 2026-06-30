export type EquipmentStatus = 'Working' | 'Standby' | 'Breakdown' | 'Stored'
export type PmStatus = 'on_time' | 'upcoming' | 'overdue'
export type AiSeverity = 'critical' | 'high' | 'medium' | 'info'

export interface FleetStatusBreakdown {
  working: number
  standby: number
  breakdown: number
  stored: number
}

export interface FleetKpi {
  totalMmtb: number
  breakdown: FleetStatusBreakdown
  /** Working Hours / Available Hours × 100 */
  fleetUtilizationPct: number
  fleetUtilizationTrendPct: number
}

export interface PmComplianceKpi {
  compliancePct: number
  trendPct: number
  completedOnTime: number
  upcomingUnder50h: number
  overdue: number
  totalPlanned: number
}

export interface ReliabilityKpi {
  mtbfHours: number
  mtbfTrendPct: number
  mttrHours: number
  mttrTrendPct: number
  mttfHours: number
  mttfTrendPct: number
  /** MTBF / (MTBF + MTTR) × 100 */
  availabilityPct?: number
}

export interface AssetEfficiencyKpi {
  totalAssetValueBillionVnd: number
  idleAssetValueBillionVnd: number
  serviceHoursPerBillionVnd: number
}

export interface RegionAllocation {
  id: string
  name: string
  machineCount: number
  /** SVG position % */
  x: number
  y: number
}

export interface UsageUnitRow {
  rank: number
  name: string
  totalMmtb: number
  utilizationPct: number
}

export interface AbnormalMetricDetail {
  metric: string
  current: string
  threshold: string
  deviation: string
  direction: 'up' | 'down'
}

export interface AiRecommendationRow {
  id: string
  severity: AiSeverity
  machineCode: string
  recommendation: string
  detail?: string
  riskScorePct: number
  ruleId: string
  confidencePct: number
  ruleType?: string
  ruleLogic: string
  timeWindow: string
  context: string
  abnormalMetrics: string[]
  metricDetails?: AbnormalMetricDetail[]
  firstOccurrence?: string
  lastOccurrence?: string
  occurrenceCount?: number
  connectionStatus?: 'Online' | 'Offline'
  manufactureYear?: number
  explanation: string
  recommendationSteps: string[]
}

export interface MmtbRow {
  id: string
  machineCode: string
  equipmentType: string
  projectLocation: string
  regionId: string
  status: EquipmentStatus
  healthScore: number
  engineHours: number
  utilizationPct: number
  mtbfHours: number
  mttrHours: number
  mttfHours: number
  pmStatus: PmStatus
  pmStatusLabel: string
  usageUnit: string
  latestAiRecommendation?: string
  /** Chi tiết thiết bị — optional, fallback trong UI helper */
  serialNumber?: string
  commissionDate?: string
  warrantyUntil?: string
  productionYear?: number
  pmDaysUntilDue?: number
  pmNextItem?: string
  pmProgressPct?: number
  imageUrl?: string
}

export interface CeoDashboardData {
  fleet: FleetKpi
  pm: PmComplianceKpi
  reliability: ReliabilityKpi
  asset: AssetEfficiencyKpi
  regions: RegionAllocation[]
  usageUnits: UsageUnitRow[]
  aiRecommendations: AiRecommendationRow[]
  machines: MmtbRow[]
  projects: string[]
}

export interface DashboardFilters {
  project: string
  region: string
  status: string
  search: string
}
