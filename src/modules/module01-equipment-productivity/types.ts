export type MachineStatus = 'Working' | 'Standby' | 'Breakdown'
export type DispatchStatus = 'On-time' | 'Delayed' | 'Pending'
export type AiSeverity = 'Critical' | 'High' | 'Medium'

export interface ProductivityMachine {
  id: string
  machineCode: string
  equipmentType: string
  projectLocation: string
  status: MachineStatus
  workingHours: number
  idleHours: number
  downtimeHours: number
  utilizationPct: number
  outputPerHour: number
  fuelLitresPerHour: number
  fuelCostVndPerHour: number
  dispatchStatus: DispatchStatus
}

export interface FleetSummary {
  workingHours: number
  idleHours: number
  downtimeHours: number
  availabilityPct: number
  availabilityTrend: number
}

export interface UtilizationKpi {
  fleetUtilizationPct: number
  fleetUtilizationTrend: number
  mobilizationRatePct: number
  mobilizationTrend: number
  dispatchCompletionPct: number
  onTimeDispatchPct: number
}

export interface OutputKpi {
  outputPerHour: number
  outputPerHourTrend: number
  outputPerShift: number
  outputPerShiftTrend: number
  outputPerDay: number
  outputPerDayTrend: number
  outputPerMonth: number
  outputPerMonthTrend: number
}

export interface FuelKpi {
  fuelPerHour: number
  fuelPerHourTrend: number
  fuelCostPerHour: number
  fuelCostPerHourTrend: number
  fuelVariancePct: number
  fuelVarianceTrend: number
  fuelLossRatePct: number
  fuelLossRateTrend: number
}

export interface ProjectPerformance {
  id: string
  name: string
  outputMCoc: number
  utilizationPct: number
  fuelEfficiency: number
  rank: number
}

export interface TrendPoint {
  day: string
  utilizationPct: number
}

export interface ShiftData {
  shift: string
  outputPerHour: number
}

export interface AiInsight {
  id: string
  severity: AiSeverity
  machineOrProject: string
  title: string
  shortDesc: string
  reasoning: string
  comparisonData: { label: string; current: string; benchmark: string }[]
  recommendations: string[]
  expectedBenefit: string
  costSavingEstimate: string
}
