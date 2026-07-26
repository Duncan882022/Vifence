import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle, ArrowUpFromLine, Bell, Car, Construction, Flame, HardHat,
  ShieldX, Siren,
} from 'lucide-react'
import type { SafetyGroupId, SafetyViolationRecord, ZoneRiskLevel } from '../types/safety.types'

export const GROUP_ICONS: Record<SafetyGroupId, LucideIcon> = {
  PPE: HardHat,
  WAH: ArrowUpFromLine,
  DZ: AlertTriangle,
  ATGT: Car,
  BPTC: Construction,
  PCCC: Flame,
}

export const GROUP_COLORS: Record<SafetyGroupId, string> = {
  PPE: 'text-sky-400',
  WAH: 'text-orange-400',
  DZ: 'text-amber-400',
  ATGT: 'text-cyan-400',
  BPTC: 'text-violet-400',
  PCCC: 'text-red-400',
}

export const GROUP_BAR_COLORS: Record<SafetyGroupId, string> = {
  PPE: 'bg-sky-500',
  WAH: 'bg-orange-500',
  DZ: 'bg-amber-500',
  ATGT: 'bg-cyan-500',
  BPTC: 'bg-violet-500',
  PCCC: 'bg-red-500',
}

export const GROUP_BADGE: Record<SafetyGroupId, string> = {
  PPE: 'bg-sky-500/10 text-sky-400 border-sky-500/30',
  WAH: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  DZ: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  ATGT: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
  BPTC: 'bg-violet-500/10 text-violet-400 border-violet-500/30',
  PCCC: 'bg-red-500/10 text-red-400 border-red-500/30',
}

export const ZONE_RISK_COLORS: Record<ZoneRiskLevel, { fill: string; stroke: string; label: string }> = {
  NORMAL: { fill: '#22c55e', stroke: '#4ade80', label: 'Bình thường' },
  WARNING: { fill: '#eab308', stroke: '#facc15', label: 'Có cảnh báo' },
  HIGH: { fill: '#f97316', stroke: '#fb923c', label: 'Vi phạm chưa xử lý' },
  CRITICAL: { fill: '#ef4444', stroke: '#f87171', label: 'Khẩn cấp' },
  NO_DATA: { fill: '#6b7280', stroke: '#9ca3af', label: 'Mất kết nối' },
}

export const SEVERITY_BADGE: Record<string, string> = {
  WARNING: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  VIOLATION: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  CRITICAL: 'bg-red-500/15 text-red-400 border-red-500/30',
}

export const SEVERITY_LABELS_UI: Record<string, string> = {
  WARNING: 'Cảnh báo',
  VIOLATION: 'Vi phạm',
  CRITICAL: 'Khẩn cấp',
}

export const SEVERITY_ICONS: Record<'CRITICAL' | 'VIOLATION' | 'WARNING', LucideIcon> = {
  CRITICAL: Siren,
  VIOLATION: ShieldX,
  WARNING: Bell,
}

/** Workflow footer — tách khỏi Severity / AI Decision */
export const WORKFLOW_FOOTER_LABELS: Record<string, string> = {
  DETECTED: 'Mới phát hiện',
  PENDING_VERIFICATION: 'Chờ HSE xác minh',
  CONFIRMED: 'Đã xác nhận',
  ASSIGNED: 'Đã giao xử lý',
  IN_PROGRESS: 'Đang khắc phục',
  PENDING_RECHECK: 'Chờ kiểm tra lại',
  CLOSED: 'Đã đóng',
  OVERDUE: 'Quá hạn',
}

export const STATUS_BADGE: Record<string, string> = {
  DETECTED: 'bg-sky-500/15 text-sky-400',
  PENDING_VERIFICATION: 'bg-violet-500/15 text-violet-400',
  CONFIRMED: 'bg-blue-500/15 text-blue-400',
  ASSIGNED: 'bg-indigo-500/15 text-indigo-400',
  IN_PROGRESS: 'bg-amber-500/15 text-amber-400',
  PENDING_RECHECK: 'bg-cyan-500/15 text-cyan-400',
  CLOSED: 'bg-green-500/15 text-green-400',
  OVERDUE: 'bg-red-500/15 text-red-400',
}

export const AUTOMATION_BADGE: Record<string, string> = {
  AUTOMATIC: 'bg-green-500/15 text-green-400 border-green-500/30',
  AI_ASSISTED: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  HSE_VERIFICATION: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
}

/** PPE + Hút thuốc — AI tự xử lý, không giao HSE thủ công */
export const SMOKING_SCENARIO_ID = 'PCCC-001'
export const AI_AUTO_STATUS_LABEL = 'AI xử lý tự động'
export const AI_AUTO_STATUS_BADGE = 'bg-green-500/15 text-green-400'
/** @deprecated */ export const PPE_AI_AUTO_STATUS_LABEL = AI_AUTO_STATUS_LABEL
/** @deprecated */ export const PPE_AI_AUTO_STATUS_BADGE = AI_AUTO_STATUS_BADGE

export const HANDLED_STATUS_LABEL = 'Đã xử lý'
export const HANDLED_STATUS_BADGE = 'bg-green-500/15 text-green-400'
export const UNHANDLED_STATUS_LABEL = 'Chưa xử lý'
export const UNHANDLED_STATUS_BADGE = 'bg-amber-500/15 text-amber-400'
export const AI_SPEAKER_STATUS_LABEL = 'AI xử lý qua Loa'
export const AI_SPEAKER_STATUS_BADGE = 'bg-red-500/15 text-red-400'
/** @deprecated */ export const CRITICAL_SPEAKER_ALERT_LABEL = AI_SPEAKER_STATUS_LABEL

export type AlertHandlingBucket = 'ai_auto' | 'ai_speaker' | 'handled' | 'unhandled'

export function isAiAutoHandled(
  record: Pick<SafetyViolationRecord, 'groupId' | 'scenarioId'>,
): boolean {
  return record.groupId === 'PPE' || record.scenarioId === SMOKING_SCENARIO_ID
}

/** @deprecated */ export function isPpeAiAutoHandled(
  record: Pick<SafetyViolationRecord, 'groupId' | 'scenarioId'>,
): boolean {
  return isAiAutoHandled(record)
}

export function isCriticalSpeakerAlert(record: Pick<SafetyViolationRecord, 'severity'>): boolean {
  return record.severity === 'CRITICAL'
}

export function getAlertHandlingStatus(
  record: Pick<SafetyViolationRecord, 'groupId' | 'scenarioId' | 'severity' | 'status'>,
): AlertHandlingBucket {
  if (isAiAutoHandled(record)) return 'ai_auto'
  if (record.status === 'CLOSED') return 'handled'
  if (record.severity === 'CRITICAL') return 'ai_speaker'
  return 'unhandled'
}

export function getAlertCardStatusDisplay(
  record: Pick<SafetyViolationRecord, 'groupId' | 'scenarioId' | 'severity' | 'status'>,
): { label: string; badgeClassName: string } {
  switch (getAlertHandlingStatus(record)) {
    case 'ai_auto':
      return { label: AI_AUTO_STATUS_LABEL, badgeClassName: AI_AUTO_STATUS_BADGE }
    case 'ai_speaker':
      return { label: AI_SPEAKER_STATUS_LABEL, badgeClassName: AI_SPEAKER_STATUS_BADGE }
    case 'handled':
      return { label: HANDLED_STATUS_LABEL, badgeClassName: HANDLED_STATUS_BADGE }
    case 'unhandled':
      return { label: UNHANDLED_STATUS_LABEL, badgeClassName: UNHANDLED_STATUS_BADGE }
  }
}

/** Chưa xử lý thủ công — loại AI tự động, Loa, đã đóng */
export function isManualUnhandled(
  record: Pick<SafetyViolationRecord, 'groupId' | 'scenarioId' | 'severity' | 'status'>,
): boolean {
  return getAlertHandlingStatus(record) === 'unhandled'
}

export function countAlertStatusBuckets(records: SafetyViolationRecord[]) {
  const aiAutoHandledCount = records.filter(v => getAlertHandlingStatus(v) === 'ai_auto').length
  const aiSpeakerHandledCount = records.filter(v => getAlertHandlingStatus(v) === 'ai_speaker').length
  const manualHandledCount = records.filter(v => getAlertHandlingStatus(v) === 'handled').length
  const unhandledCount = records.filter(v => getAlertHandlingStatus(v) === 'unhandled').length
  const handledTotalCount = aiAutoHandledCount + aiSpeakerHandledCount + manualHandledCount
  const handledRate = records.length
    ? Math.round((handledTotalCount / records.length) * 100)
    : 0
  return {
    aiAutoHandledCount,
    aiSpeakerHandledCount,
    manualHandledCount,
    unhandledCount,
    handledTotalCount,
    handledRate,
  }
}

export function formatSla(v: { status: string; dueAt?: string }): { label: string; className: string } {
  if (v.status === 'OVERDUE') return { label: 'Quá hạn', className: 'text-red-400' }
  if (!v.dueAt) return { label: 'Còn hạn', className: 'text-muted-foreground' }
  const due = new Date(v.dueAt).getTime()
  const now = Date.now()
  if (due < now) return { label: 'Quá hạn', className: 'text-red-400' }
  const hours = Math.round((due - now) / 3600_000)
  if (hours <= 4) return { label: `Còn ${hours}h`, className: 'text-amber-400' }
  return { label: 'Còn hạn', className: 'text-green-400' }
}
