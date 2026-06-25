export type ViolationType =
  | 'no-helmet'
  | 'no-vest'
  | 'no-harness'
  | 'danger-zone'
  | 'work-at-height'

export type ViolationStatus = 'pending' | 'processed'

export interface SafetyViolation {
  id: string
  type: ViolationType
  description: string
  workerId?: string
  workerName?: string
  contractorName?: string
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

export interface SafetyStats {
  totalViolations: number
  pending: number
  processed: number
  topViolators: { name: string; count: number }[]
  topContractors: { name: string; count: number }[]
  topZones: { name: string; count: number }[]
}
