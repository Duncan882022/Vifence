import type { KPIData } from '@/types/api'
import type {
  HousekeepingCategoryId,
  HousekeepingCategoryScore,
  HousekeepingImprovementItem,
  HousekeepingIssue,
  HousekeepingOverallScore,
  HousekeepingScoreTrendPoint,
  HousekeepingStats,
  HousekeepingWorkerRank,
  HousekeepingZoneScore,
  IssueSeverity,
} from '@/types/housekeeping'
import {
  DEMO_HOUSEKEEPING_TODAY,
  getIssueSeverity,
  HOUSEKEEPING_ISSUES,
} from '../data/housekeepingIssues'
import {
  HOUSEKEEPING_CATEGORY_SCORES,
  HOUSEKEEPING_IMPROVEMENT_LIST,
  HOUSEKEEPING_OVERALL_SCORE,
  HOUSEKEEPING_SCORE_TREND,
  HOUSEKEEPING_ZONE_SCORES,
} from '../data/housekeepingScores'

export interface HousekeepingPeriodCounts {
  total: number
  high: number
  medium: number
  low: number
  processed: number
  pending: number
}

export interface HousekeepingDailySummary {
  periodLabel: string
  current: HousekeepingPeriodCounts
  previous: HousekeepingPeriodCounts
  metrics: KPIData[]
  stats: HousekeepingStats
}

/** Demo 7-day KPI targets from mockup */
export const DEMO_HOUSEKEEPING_7DAY_CURRENT: HousekeepingPeriodCounts = {
  total: 96,
  high: 28,
  medium: 38,
  low: 30,
  processed: 62,
  pending: 34,
}

export const DEMO_HOUSEKEEPING_7DAY_PREVIOUS: HousekeepingPeriodCounts = {
  total: 82,
  high: 24,
  medium: 34,
  low: 28,
  processed: 54,
  pending: 28,
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

function countBySeverity(issues: HousekeepingIssue[]): Pick<HousekeepingPeriodCounts, 'high' | 'medium' | 'low'> {
  let high = 0
  let medium = 0
  let low = 0
  for (const issue of issues) {
    const sev = getIssueSeverity(issue.type)
    if (sev === 'high') high += 1
    else if (sev === 'medium') medium += 1
    else low += 1
  }
  return { high, medium, low }
}

function computePeriodCounts(issues: HousekeepingIssue[]): HousekeepingPeriodCounts {
  const { high, medium, low } = countBySeverity(issues)
  const processed = issues.filter(i => i.status === 'processed').length
  const pending = issues.filter(i => i.status === 'pending').length
  return { total: issues.length, high, medium, low, processed, pending }
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

function buildMetrics(current: HousekeepingPeriodCounts, previous: HousekeepingPeriodCounts): KPIData[] {
  const defs: {
    label: string
    key: keyof Pick<HousekeepingPeriodCounts, 'total' | 'high' | 'pending' | 'processed'>
    higherIsBetter: boolean
  }[] = [
    { label: 'Tổng sự cố', key: 'total', higherIsBetter: false },
    { label: 'Mức cao', key: 'high', higherIsBetter: false },
    { label: 'Chưa xử lý', key: 'pending', higherIsBetter: false },
    { label: 'Đã xử lý', key: 'processed', higherIsBetter: true },
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

function buildWorkerStats(issues: HousekeepingIssue[]): HousekeepingWorkerRank[] {
  const map = new Map<string, HousekeepingWorkerRank>()

  for (const issue of issues) {
    const name = issue.workerName ?? 'Không rõ'
    const existing = map.get(name)
    if (existing) {
      existing.count += 1
    } else {
      map.set(name, {
        name,
        contractorName: issue.contractorName,
        teamName: issue.teamName,
        count: 1,
      })
    }
  }

  return [...map.values()].sort((a, b) => b.count - a.count)
}

function buildIssueStats(issues: HousekeepingIssue[]): HousekeepingStats {
  const contractorMap = new Map<string, number>()
  const zoneMap = new Map<string, number>()

  for (const issue of issues) {
    if (issue.contractorName) {
      contractorMap.set(issue.contractorName, (contractorMap.get(issue.contractorName) ?? 0) + 1)
    }
    zoneMap.set(issue.location, (zoneMap.get(issue.location) ?? 0) + 1)
  }

  const toSorted = (map: Map<string, number>) =>
    [...map.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)

  return {
    totalIssues: issues.length,
    pending: issues.filter(i => i.status === 'pending').length,
    processed: issues.filter(i => i.status === 'processed').length,
    topWorkers: buildWorkerStats(issues),
    topContractors: toSorted(contractorMap),
    topZones: toSorted(zoneMap),
  }
}

export function computeHousekeepingDailySummary(
  issues: HousekeepingIssue[] = HOUSEKEEPING_ISSUES,
  endDate: string = DEMO_HOUSEKEEPING_TODAY,
): HousekeepingDailySummary {
  const currentPeriod = issues.filter(i => isWithinDays(i.timestamp, endDate, PERIOD_DAYS))
  const previousPeriod = issues.filter(i => isWithinPreviousPeriod(i.timestamp, endDate, PERIOD_DAYS))

  const current = currentPeriod.length > 0
    ? computePeriodCounts(currentPeriod)
    : { ...DEMO_HOUSEKEEPING_7DAY_CURRENT }

  const previous = previousPeriod.length > 0
    ? computePeriodCounts(previousPeriod)
    : { ...DEMO_HOUSEKEEPING_7DAY_PREVIOUS }

  return {
    periodLabel: '7 ngày qua',
    current,
    previous,
    metrics: buildMetrics(current, previous),
    stats: buildIssueStats(currentPeriod.length > 0 ? currentPeriod : issues),
  }
}

export function filterIssuesBySeverity(
  issues: HousekeepingIssue[],
  severity: IssueSeverity | 'all',
): HousekeepingIssue[] {
  if (severity === 'all') return issues
  return issues.filter(i => getIssueSeverity(i.type) === severity)
}

export function getHousekeepingOverallScore(): HousekeepingOverallScore {
  return HOUSEKEEPING_OVERALL_SCORE
}

export function getHousekeepingScoreTrend(): HousekeepingScoreTrendPoint[] {
  return HOUSEKEEPING_SCORE_TREND
}

export function getHousekeepingCategoryScores(): HousekeepingCategoryScore[] {
  return HOUSEKEEPING_CATEGORY_SCORES
}

export function getHousekeepingZoneScores(): HousekeepingZoneScore[] {
  return HOUSEKEEPING_ZONE_SCORES
}

export function getHousekeepingImprovementList(): HousekeepingImprovementItem[] {
  return HOUSEKEEPING_IMPROVEMENT_LIST
}

export interface ImprovementListFilters {
  categoryId?: HousekeepingCategoryId | null
  zoneId?: string | null
  severity?: 'all' | 'high' | 'medium'
  search?: string
}

export function filterImprovementList(
  items: HousekeepingImprovementItem[],
  filters: ImprovementListFilters,
): HousekeepingImprovementItem[] {
  const query = filters.search?.trim().toLowerCase() ?? ''

  return items.filter(item => {
    if (filters.categoryId && item.categoryId !== filters.categoryId) return false
    if (filters.zoneId && item.zoneId !== filters.zoneId) return false
    if (filters.severity && filters.severity !== 'all' && item.priority !== filters.severity) return false
    if (!query) return true

    return (
      item.issueType.toLowerCase().includes(query)
      || item.zoneLabel.toLowerCase().includes(query)
      || (item.floorLabel?.toLowerCase().includes(query) ?? false)
    )
  })
}

export function getHousekeepingScoreDelta(): number {
  const { current, previous } = HOUSEKEEPING_OVERALL_SCORE
  return current - previous
}
