import type { KPIData } from '@/types/api'
import type { SafetyStats, SafetyViolation, SafetyViolatorRank, ViolationSeverity, ViolationType } from '@/types/safety'
import {
  DEMO_SAFETY_DATE_LABEL,
  DEMO_SAFETY_TODAY,
  getViolationSeverity,
  SAFETY_VIOLATIONS,
} from '../data/safetyViolations'
import { countViolationsByType } from '../utils/safetyUiHelpers'

export interface SafetyPeriodCounts {
  total: number
  high: number
  medium: number
  low: number
  processed: number
  pending: number
}

export interface SafetyDayStats {
  dateLabel: string
  ppeCompliance: number
  violationsToday: number
  violationsPending: number
  violationsProcessed: number
  violationsHigh: number
  violationsMedium: number
  violationsLow: number
  violationsByType: Partial<Record<ViolationType, number>>
  activeCameras: number
  totalCameras: number
  penaltiesResolved: number
  penaltiesPending: number
}

export interface SafetyDailySummary {
  today: SafetyDayStats
  yesterday: SafetyDayStats
  periodLabel: string
  current: SafetyPeriodCounts
  previous: SafetyPeriodCounts
  metrics: KPIData[]
  stats: SafetyStats
}

/** Demo targets when period slice is empty */
export const DEMO_SAFETY_7DAY_CURRENT: SafetyPeriodCounts = {
  total: 21,
  high: 9,
  medium: 6,
  low: 6,
  processed: 17,
  pending: 4,
}

export const DEMO_SAFETY_7DAY_PREVIOUS: SafetyPeriodCounts = {
  total: 22,
  high: 9,
  medium: 6,
  low: 7,
  processed: 16,
  pending: 6,
}

export const DEMO_SAFETY_TODAY_STATS: SafetyDayStats = {
  dateLabel: DEMO_SAFETY_DATE_LABEL,
  ppeCompliance: 92,
  violationsToday: 6,
  violationsPending: 3,
  violationsProcessed: 3,
  violationsHigh: 4,
  violationsMedium: 1,
  violationsLow: 1,
  violationsByType: { 'no-harness': 1, 'no-helmet': 1, 'no-vest': 1, 'danger-zone': 1, 'work-at-height': 1, 'fall': 1 },
  activeCameras: 12,
  totalCameras: 14,
  penaltiesResolved: 24,
  penaltiesPending: 5,
}

export const DEMO_SAFETY_YESTERDAY_STATS: SafetyDayStats = {
  dateLabel: '30/06/2026',
  ppeCompliance: 86,
  violationsToday: 5,
  violationsPending: 1,
  violationsProcessed: 4,
  violationsHigh: 2,
  violationsMedium: 1,
  violationsLow: 2,
  violationsByType: { 'danger-zone': 1, 'work-at-height': 1, 'no-helmet': 1, 'no-vest': 1, 'fall': 1 },
  activeCameras: 12,
  totalCameras: 14,
  penaltiesResolved: 22,
  penaltiesPending: 6,
}

const PERIOD_DAYS = 7

function parseDate(iso: string): Date {
  return new Date(`${iso}T00:00:00`)
}

function formatIso(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function isoDateLabel(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
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

function violationsOnDate(violations: SafetyViolation[], dateIso: string): SafetyViolation[] {
  return violations.filter(v => v.timestamp.startsWith(dateIso))
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

function computeDayStats(
  violations: SafetyViolation[],
  dateIso: string,
  dateLabel: string,
  demoFallback: SafetyDayStats,
): SafetyDayStats {
  const dayViolations = violationsOnDate(violations, dateIso)
  if (dayViolations.length === 0) return { ...demoFallback, dateLabel }

  const { high, medium, low } = countBySeverity(dayViolations)
  const pending = dayViolations.filter(v => v.status === 'pending').length
  const processed = dayViolations.filter(v => v.status === 'processed').length
  const ppeCompliance = Math.max(0, 100 - high * 5 - medium * 2 - low * 1)

  return {
    dateLabel,
    ppeCompliance,
    violationsToday: dayViolations.length,
    violationsPending: pending,
    violationsProcessed: processed,
    violationsHigh: high,
    violationsMedium: medium,
    violationsLow: low,
    violationsByType: countViolationsByType(dayViolations),
    activeCameras: demoFallback.activeCameras,
    totalCameras: demoFallback.totalCameras,
    penaltiesResolved: demoFallback.penaltiesResolved,
    penaltiesPending: demoFallback.penaltiesPending,
  }
}

function delta(current: number, previous: number): Pick<KPIData, 'change' | 'changeType'> {
  const change = Math.round((current - previous) * 10) / 10
  if (change === 0) return { change: 0, changeType: 'neutral' }
  return { change, changeType: change > 0 ? 'increase' : 'decrease' }
}

function buildMetrics(today: SafetyDayStats, yesterday: SafetyDayStats): KPIData[] {
  return [
    {
      label: 'PPE',
      value: today.ppeCompliance,
      unit: '%',
      detail: 'OCP1',
      ...delta(today.ppeCompliance, yesterday.ppeCompliance),
      previousValue: yesterday.ppeCompliance,
      higherIsBetter: true,
      changeUnit: 'điểm %',
    },
    {
      label: 'Vi phạm',
      value: today.violationsToday,
      unit: 'vi phạm',
      detail: 'OCP1',
      ...delta(today.violationsToday, yesterday.violationsToday),
      previousValue: yesterday.violationsToday,
      higherIsBetter: false,
      changeUnit: 'vi phạm',
    },
    {
      label: 'Camera',
      value: today.activeCameras,
      unit: 'Camera',
      detail: `/${today.totalCameras}`,
      ...delta(today.activeCameras, yesterday.activeCameras),
      previousValue: yesterday.activeCameras,
      higherIsBetter: true,
      changeUnit: 'cam',
    },
    {
      label: 'Xử phạt',
      value: today.penaltiesResolved,
      unit: 'đã xử lý',
      detail: today.penaltiesPending > 0 ? `${today.penaltiesPending} chưa xử lý` : undefined,
      ...delta(today.penaltiesResolved, yesterday.penaltiesResolved),
      previousValue: yesterday.penaltiesResolved,
      higherIsBetter: true,
      changeUnit: 'ca',
    },
  ]
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
  const yesterdayIso = formatIso((() => {
    const d = parseDate(endDate)
    d.setDate(d.getDate() - 1)
    return d
  })())

  const today = computeDayStats(
    violations,
    endDate,
    DEMO_SAFETY_DATE_LABEL,
    DEMO_SAFETY_TODAY_STATS,
  )
  const yesterday = computeDayStats(
    violations,
    yesterdayIso,
    isoDateLabel(yesterdayIso),
    DEMO_SAFETY_YESTERDAY_STATS,
  )

  const currentPeriod = violations.filter(v => isWithinDays(v.timestamp, endDate, PERIOD_DAYS))
  const previousPeriod = violations.filter(v => isWithinPreviousPeriod(v.timestamp, endDate, PERIOD_DAYS))

  const current = currentPeriod.length > 0
    ? computePeriodCounts(currentPeriod)
    : { ...DEMO_SAFETY_7DAY_CURRENT }

  const previous = previousPeriod.length > 0
    ? computePeriodCounts(previousPeriod)
    : { ...DEMO_SAFETY_7DAY_PREVIOUS }

  return {
    today,
    yesterday,
    periodLabel: '7 ngày qua',
    current,
    previous,
    metrics: buildMetrics(today, yesterday),
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
