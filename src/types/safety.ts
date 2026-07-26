export type ViolationType =
  | 'ppe'
  | 'work-at-height'
  | 'danger-zone'
  | 'traffic-safety'
  | 'method-statement'
  | 'fire-hot-work'

export type ViolationSeverity = 'high' | 'medium' | 'low'

export type ViolationStatus = 'pending' | 'processed'

export type TrafficRole = 'tài xế' | 'điều hướng'

/** traffic-safety — xe / người / cả hai / hiện trường (phân làn, phân luồng) */
export type TrafficSubject = 'vehicle' | 'person' | 'both' | 'site'

export interface SafetyTrafficVehicle {
  plate: string
  type: string
}

export interface SafetyViolation {
  id: string
  type: ViolationType
  /** Scenario chi tiết theo Safety Monitoring Dictionary */
  scenario: string
  description: string
  workerId?: string
  workerName?: string
  employeeCode?: string
  contractorName?: string
  teamName?: string
  /** Chỉ traffic-safety — xe bắt buộc khi subject gồm vehicle */
  vehicle?: SafetyTrafficVehicle
  /** Chỉ traffic-safety — người bắt buộc khi subject gồm person */
  trafficRole?: TrafficRole
  /** Chỉ traffic-safety — rõ đối tượng giám sát */
  trafficSubject?: TrafficSubject
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
