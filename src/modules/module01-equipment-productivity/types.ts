export type MachineStatus = 'working' | 'idle' | 'breakdown' | 'stored'
export type DispatchStatus = 'on-time' | 'delayed' | 'pending'
export type PileStatus = 'not-started' | 'in-progress' | 'completed' | 'delayed' | 'blocked'
export type DelayReason =
  | 'machine-breakdown'
  | 'lack-worker'
  | 'lack-cement'
  | 'lack-bentonite'
  | 'lack-concrete'
  | 'lack-steel-cage'
  | 'site-not-ready'
  | 'weather'
  | 'inspection-waiting'
export type AiSeverity = 'critical' | 'high' | 'medium'

export interface Project {
  id: string
  code: string
  name: string
  region: string
  plannedOutputM: number
  actualOutputM: number
  startDate: string
  endDate: string
}

export interface Worksite {
  id: string
  projectId: string
  code: string
  name: string
  plannedPiles: number
  completedPiles: number
  inProgressPiles: number
  delayedPiles: number
  blockedPiles: number
  materialReadiness: {
    laborPct: number
    cementPct: number
    bentonitePct: number
    steelCagePct: number
    concretePct: number
  }
}

export interface PileAssignment {
  id: string
  pileCode: string
  machineId: string
  worksiteId: string
  diameterMm: number
  depthM: number
  plannedStart: string
  plannedEnd: string
  plannedDurationH: number
  actualStart?: string
  actualEnd?: string
  actualDurationH?: number
  status: PileStatus
  delayHours: number
  delayReason?: DelayReason
  fuelUsedLitres?: number
}

export interface Machine {
  id: string
  code: string
  type: string
  projectId: string
  worksiteId: string
  status: MachineStatus
  workingHours: number
  idleHours: number
  downtimeHours: number
  utilizationPct: number
  outputPerHour: number
  plannedOutputToday: number
  actualOutputToday: number
  fuelLitresPerHour: number
  fuelBaselineLitresPerHour: number
  fuelCostVndPerLitre: number
  dispatchStatus: DispatchStatus
  currentPileId?: string
}

export interface AiAlert {
  id: string
  severity: AiSeverity
  category: 'machine' | 'project' | 'fuel' | 'dispatch' | 'material'
  subject: string
  title: string
  summary: string
  reasoning: string
  evidence: { label: string; actual: string; expected: string }[]
  recommendations: string[]
  benefit: string
  costSavingEstimate: string
  createdAt: string
  read: boolean
}
