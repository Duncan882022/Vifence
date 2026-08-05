import type { SafetyViolationRecord, ViolationStatus } from '../types/safety.types'

/** Không dùng seed mock — sự kiện chỉ từ backend AI + overlay live */
export const SAFETY_VIOLATION_RECORDS: SafetyViolationRecord[] = []

export function getTodayViolations(): SafetyViolationRecord[] {
  return []
}

export function getYesterdayViolations(): SafetyViolationRecord[] {
  return []
}

export function isOpenStatus(status: ViolationStatus): boolean {
  return status !== 'CLOSED'
}

export const OPEN_STATUSES: ViolationStatus[] = [
  'DETECTED', 'PENDING_VERIFICATION', 'CONFIRMED', 'ASSIGNED',
  'IN_PROGRESS', 'PENDING_RECHECK', 'OVERDUE',
]
