export type IssueType =
  | 'waste-pile'
  | 'misplaced-material'
  | 'standing-water'
  | 'messy-area'
  | 'blocked-path'
  | 'unsanitary-zone'

export type ScoreTier = 'good' | 'average' | 'poor'

export type HousekeepingCategoryId =
  | 'waste-pile'
  | 'misplaced-material'
  | 'standing-water'
  | 'messy-area'
  | 'general-cleanliness'

export interface HousekeepingCategoryScore {
  id: HousekeepingCategoryId
  label: string
  score: number
  tier: ScoreTier
  violationCount: number
}

export interface HousekeepingZoneScore {
  id: string
  label: string
  score: number
  tier: ScoreTier
}

export interface HousekeepingScoreTrendPoint {
  date: string
  label: string
  score: number
}

export interface HousekeepingOverallScore {
  current: number
  previous: number
  max: number
  tier: ScoreTier
  tierLabel: string
  hint: string
}

export interface HousekeepingDetectionCard {
  categoryId: HousekeepingCategoryId
  label: string
  violationImageUrl: string
  violationDetectedAt: string
  improvedImageUrl: string
  improvedAt: string
}

export interface HousekeepingImprovementItem {
  id: string
  thumbnailUrl: string
  zoneLabel: string
  floorLabel?: string
  issueType: string
  detectedAt: string
  priority: 'high' | 'medium'
}

export type IssueSeverity = 'high' | 'medium' | 'low'

export type IssueStatus = 'pending' | 'processed'

export interface HousekeepingIssue {
  id: string
  type: IssueType
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
  status: IssueStatus
  processedBy?: string
  processedAt?: string
  notes?: string
}

export interface HousekeepingWorkerRank {
  name: string
  contractorName?: string
  teamName?: string
  count: number
}

export interface HousekeepingStats {
  totalIssues: number
  pending: number
  processed: number
  topWorkers: HousekeepingWorkerRank[]
  topContractors: { name: string; count: number }[]
  topZones: { name: string; count: number }[]
}
