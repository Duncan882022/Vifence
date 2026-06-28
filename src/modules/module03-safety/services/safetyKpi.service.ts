import type { KPIData } from '@/types/api'
import type { SafetyStats, SafetyViolation, SafetyViolatorRank, ViolationSeverity } from '@/types/safety'
import {
  DEMO_SAFETY_TODAY,
  getViolationSeverity,
  SAFETY_VIOLATIONS,
} from '../data/safetyViolations'

export interface SafetyPeriodCounts {
  total: number
  high: number
  medium: number
  low: number
  processed: number
  pending: number
}

export interface SafetyDayStats extends SafetyPeriodCounts {
  dateLabel: string
}

export interface SafetyDailySummary {
  periodLabel: string
  current: SafetyPeriodCounts
  previous: SafetyPeriodCounts
  metrics: KPIData[]
  stats: SafetyStats
}

/** Demo 7-day KPI targets from mockup */
export const DEMO_SAFETY_7DAY_CURRENT: SafetyPeriodCounts = {
  total: 128,
  high: 36,
  medium: 58,
  low: 34,
  processed: 86,
  pending: 42,
}

export const DEMO_SAFETY_7DAY_PREVIOUS: SafetyPeriodCounts = {
  total: 108,
  high: 32,
  medium: 55,
  low: 38,
  processed: 70,
  pending: 38,
}

const PERIOD_DAYS = 7

function parseDate(iso: string): Date {
  return new Date(`${iso}T00:00:00`)
}

function isWithinDays(timestamp: string, endDate: string, days: number): boolean {
  const end = parseDate(endDate)
  const start = new Date(end)
  start.setDate(start.getDate() - (days - 1))
  const ts = new Date(timestamp)
  return ts >= start && ts <= new Date(`${endDate}T23:59:59`)
}

function isWithinPreviousPeriod(timestamp: string, endDate: string, days: number): boolean {
  const end = parseDate(endDate)
  end.setDate(end.getDate() - days)
  const start = new Date(end)
  start.setDate(start.getDate() - (days - 1))
  const ts = new Date(timestamp)
  return ts >= start && ts <= new Date(`${formatIso(end)}T23:59:59`)
}

function formatIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function countBySeverity(violations: SafetyViolation[]): Pick<SafetyPeriodCounts, 'high' | 'medium' | 'low'> {
  let high = 0
  let medium = 0
  let low = 0
  for (const v of violations) {
    const sev = getViolationSeverity(v.type)
    if (sev === 'high') high += 1
    else if (sev === 'medium') medium += 1
    else low += 1
  }
  return { high, medium, low }
}

function computePeriodCounts(violations: SafetyViolation[]): SafetyPeriodCounts {
  const { high, medium, low } = countBySeverity(violations)
  const processed = violations.filter(v => v.status === 'processed').length
  const pending = violations.filter(v => v.status === 'pending').length
  return { total: violations.length, high, medium, low, processed, pending }
}

function percentDelta(current: number, previous: number): Pick<KPIData, 'change' | 'changeType'> {
  if (previous === 0) {
    if (current === 0) return { change: 0, changeType: 'neutral' }
    return { change: 100, changeType: 'increase' }
  }
  const pct = Math.round(((current - previous) / previous) * 100)
  if (pct === 0) return { change: 0, changeType: 'neutral' }
  return { change: pct, changeType: pct > 0 ? 'increase' : 'decrease' }
}

function buildMetrics(current: SafetyPeriodCounts, previous: SafetyPeriodCounts): KPIData[] {
  const defs: {
    label: string
    key: keyof Pick<SafetyPeriodCounts, 'total' | 'high' | 'medium' | 'low'>
    higherIsBetter: boolean
  }[] = [
    { label: 'Tổng số vi phạm', key: 'total', higherIsBetter: false },
    { label: 'Mức cao', key: 'high', higherIsBetter: false },
    { label: 'Mức trung bình', key: 'medium', higherIsBetter: false },
    { label: 'Mức thấp', key: 'low', higherIsBetter: false },
  ]

  return defs.map(({ label, key, higherIsBetter }) => ({
    label,
    value: current[key],
    unit: '',
    ...percentDelta(current[key], previous[key]),
    previousValue: previous[key],
    higherIsBetter,
    changeUnit: '%',
  }))
}

function buildWorkerStats(violations: SafetyViolation[]): SafetyViolatorRank[] {
  const map = new Map<string, SafetyViolatorRank>()

  for (const v of violations) {
    const name = v.workerName ?? 'Không rõ'
    const existing = map.get(name)
    if (existing) {
      existing.count += 1
    } else {
      map.set(name, {
        name,
        contractorName: v.contractorName,
        teamName: v.teamName,
        count: 1,
      })
    }
  }

  return [...map.values()].sort((a, b) => b.count - a.count)
}

function buildContractorStats(violations: SafetyViolation[]): SafetyStats {
  const contractorMap = new Map<string, number>()
  const zoneMap = new Map<string, number>()

  for (const v of violations) {
    if (v.contractorName) {
      contractorMap.set(v.contractorName, (contractorMap.get(v.contractorName) ?? 0) + 1)
    }
    zoneMap.set(v.location, (zoneMap.get(v.location) ?? 0) + 1)
  }

  const toSorted = (map: Map<string, number>) =>
    [...map.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)

  return {
    totalViolations: violations.length,
    pending: violations.filter(v => v.status === 'pending').length,
    processed: violations.filter(v => v.status === 'processed').length,
    topViolators: buildWorkerStats(violations),
    topContractors: toSorted(contractorMap),
    topZones: toSorted(zoneMap),
  }
}

export function computeSafetyDailySummary(
  violations: SafetyViolation[] = SAFETY_VIOLATIONS,
  endDate: string = DEMO_SAFETY_TODAY,
): SafetyDailySummary {
  const currentPeriod = violations.filter(v => isWithinDays(v.timestamp, endDate, PERIOD_DAYS))
  const previousPeriod = violations.filter(v => isWithinPreviousPeriod(v.timestamp, endDate, PERIOD_DAYS))

  const current = currentPeriod.length > 0
    ? computePeriodCounts(currentPeriod)
    : { ...DEMO_SAFETY_7DAY_CURRENT }

  const previous = previousPeriod.length > 0
    ? computePeriodCounts(previousPeriod)
    : { ...DEMO_SAFETY_7DAY_PREVIOUS }

  return {
    periodLabel: '7 ngày qua',
    current,
    previous,
    metrics: buildMetrics(current, previous),
    stats: buildContractorStats(currentPeriod.length > 0 ? currentPeriod : violations),
  }
}

export function getSafetyViolations(
  violations: SafetyViolation[] = SAFETY_VIOLATIONS,
): SafetyViolation[] {
  return violations
}

export function filterViolationsBySeverity(
  violations: SafetyViolation[],
  severity: ViolationSeverity | 'all',
): SafetyViolation[] {
  if (severity === 'all') return violations
  return violations.filter(v => getViolationSeverity(v.type) === severity)
}
