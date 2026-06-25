export type ReportPeriod = 'daily' | 'weekly' | 'monthly'
export type ReportFormat = 'pdf' | 'excel'

export interface ExecutiveReport {
  period: ReportPeriod
  date: string
  workforce: {
    totalPresent: number
    checkInToday: number
    checkOutToday: number
    guests: number
  }
  safety: {
    totalViolations: number
    pending: number
    processed: number
  }
  training: {
    sessionsToday: number
    attendanceRate: number
  }
  housekeeping: {
    issues: number
    resolved: number
  }
  assets: {
    active: number
    inactive: number
    misplaced: number
  }
}

export interface InspectionItem {
  id: string
  title: string
  category: string
  status: 'pending' | 'approved' | 'rejected'
  submittedBy: string
  submittedAt: string
  reviewedBy?: string
  reviewedAt?: string
  imageUrls?: string[]
  notes?: string
}
