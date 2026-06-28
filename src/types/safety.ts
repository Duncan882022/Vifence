export type ViolationType =
  | 'no-helmet'
  | 'no-vest'
  | 'no-harness'
  | 'danger-zone'
  | 'work-at-height'
  | 'fall'

export type ViolationSeverity = 'high' | 'medium' | 'low'

export type ViolationStatus = 'pending' | 'processed'

export interface SafetyViolation {
  id: string
  type: ViolationType
  description: string
  workerId?: string
  workerName?: string
  employeeCode?: string
  contractorName?: string
  teamName?: string
  location: string
  cameraId: string
  cameraName: string
  timestamp: string
  imageUrl?: string
  videoUrl?: string
  status: ViolationStatus
  processedBy?: string
  processedAt?: string
  notes?: string
}

export interface SafetyViolatorRank {
  name: string
  contractorName?: string
  teamName?: string
  count: number
}

export interface SafetyStats {
  totalViolations: number
  pending: number
  processed: number
  topViolators: SafetyViolatorRank[]
  topContractors: { name: string; count: number }[]
  topZones: { name: string; count: number }[]
}
