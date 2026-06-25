export type TrainingStatus = 'upcoming' | 'in-progress' | 'completed' | 'cancelled'
export type AttendanceStatus = 'present' | 'late' | 'absent' | 'left-early'

export interface TrainingSession {
  id: string
  title: string
  instructor: string
  location: string
  scheduledAt: string
  endAt: string
  status: TrainingStatus
  totalEnrolled: number
  present: number
  late: number
  absent: number
}

export interface TrainingAttendance {
  id: string
  sessionId: string
  workerId: string
  workerName: string
  contractorName: string
  checkInTime?: string
  checkOutTime?: string
  status: AttendanceStatus
  eventId?: string
}
