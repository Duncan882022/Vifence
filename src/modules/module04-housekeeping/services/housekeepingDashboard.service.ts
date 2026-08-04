import type { LucideIcon } from 'lucide-react'
import {
  AlertTriangle,
  CircleAlert,
  Package,
  Droplets,
  Trash2,
  Truck,
  Sparkles,
} from 'lucide-react'
import type {
  HousekeepingAiGroupId,
  HousekeepingAlertSeverity,
  HousekeepingDashboardFilters,
  HousekeepingDashboardKpis,
  HousekeepingEventRecord,
  HousekeepingEventStatus,
  HousekeepingGroupStats,
} from '../types/housekeepingAi.types'
import { HOUSEKEEPING_DEMO_TODAY } from '../data/housekeepingDemoDate'
import {
  getHousekeepingScenarioName,
  HOUSEKEEPING_AI_SCENARIOS,
  HOUSEKEEPING_SCENARIO_MAP,
} from '../data/housekeepingScenarios'
import { HOUSEKEEPING_AI_CONFIG } from '../data/housekeepingRoiConfig'

export const GROUP_ICONS: Record<HousekeepingAiGroupId, LucideIcon> = {
  LOG: Truck,
  HK: Sparkles,
}

export const GROUP_COLORS: Record<HousekeepingAiGroupId, string> = {
  LOG: 'text-amber-400',
  HK: 'text-emerald-400',
}

export const GROUP_BADGE: Record<HousekeepingAiGroupId, string> = {
  LOG: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  HK: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
}

export const GROUP_BORDER_ACCENT: Record<HousekeepingAiGroupId, string> = {
  LOG: 'border-l-amber-500/50',
  HK: 'border-l-emerald-500/50',
}

export const SCENARIO_ICONS: Record<string, LucideIcon> = {
  'LOG-01': Package,
  'HK-01': AlertTriangle,
  'HK-02': Droplets,
  'HK-03': Package,
  'HK-04': Trash2,
}

export const SEVERITY_LABELS: Record<HousekeepingAlertSeverity, string> = {
  WARNING: 'Cảnh báo',
  VIOLATION: 'Vi phạm',
  CRITICAL: 'Khẩn cấp',
}

export const SEVERITY_BADGE: Record<HousekeepingAlertSeverity, string> = {
  WARNING: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  VIOLATION: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
  CRITICAL: 'bg-red-500/10 text-red-400 border-red-500/30',
}

export const SEVERITY_ICONS: Record<HousekeepingAlertSeverity, LucideIcon> = {
  WARNING: AlertTriangle,
  VIOLATION: CircleAlert,
  CRITICAL: AlertTriangle,
}

export const STATUS_LABELS: Record<HousekeepingEventStatus, string> = {
  DETECTED: 'Phát hiện',
  ASSIGNED: 'Đã giao',
  IN_PROGRESS: 'Đang xử lý',
  PENDING_RECHECK: 'Chờ kiểm tra',
  CLOSED: 'Đã đóng',
}

export function getScenarioIcon(scenarioId: string): LucideIcon | undefined {
  return SCENARIO_ICONS[scenarioId]
}

function isLiveAiHousekeepingRecord(record: HousekeepingEventRecord): boolean {
  return record.id.startsWith('ai-hk-')
}

/** Mock demo dùng HOUSEKEEPING_DEMO_TODAY; sự kiện AI live luôn hiển thị (ngày thật từ backend). */
function isToday(record: HousekeepingEventRecord, date = HOUSEKEEPING_DEMO_TODAY): boolean {
  if (isLiveAiHousekeepingRecord(record)) return true
  return record.detectedAt.startsWith(date)
}

export function filterHousekeepingEvents(
  records: HousekeepingEventRecord[],
  filters: HousekeepingDashboardFilters,
): HousekeepingEventRecord[] {
  const q = filters.searchQuery?.trim().toLowerCase() ?? ''
  return records.filter(r => {
    if (filters.dateRange === 'today' && !isToday(r)) return false
    if (filters.groupId && r.groupId !== filters.groupId) return false
    if (filters.scenarioId && r.scenarioId !== filters.scenarioId) return false
    if (filters.status && r.status !== filters.status) return false
    if (filters.roiType && r.roiType !== filters.roiType) return false
    if (!q) return true
    const name = getHousekeepingScenarioName(r.scenarioId)
    return (
      name.toLowerCase().includes(q)
      || r.description?.toLowerCase().includes(q)
      || r.sourceDeviceId.toLowerCase().includes(q)
      || r.id.toLowerCase().includes(q)
    )
  })
}

export function isUnhandledEvent(r: HousekeepingEventRecord): boolean {
  return r.status !== 'CLOSED'
}

export function computeHousekeepingDashboardKpis(
  records: HousekeepingEventRecord[],
): HousekeepingDashboardKpis {
  const today = records.filter(r => isToday(r))
  const logEvents = today.filter(r => r.groupId === 'LOG' && r.roiType === 'ROAD')
  const hkEvents = today.filter(r => r.groupId === 'HK')

  const occupancyDwells = logEvents
    .map(r => r.dwellMinutes ?? 0)
    .filter(d => d > 0)
  const avgOccupancy = occupancyDwells.length
    ? Math.round(occupancyDwells.reduce((a, b) => a + b, 0) / occupancyDwells.length)
    : 0

  const zoneCounts = new Map<string, number>()
  for (const r of logEvents) {
    zoneCounts.set(r.zoneId, (zoneCounts.get(r.zoneId) ?? 0) + 1)
  }
  const topZone = [...zoneCounts.entries()].sort((a, b) => b[1] - a[1])[0]

  const mudEvents = hkEvents.filter(r => r.scenarioId === 'HK-01').length
  const waterEvents = hkEvents.filter(r => r.scenarioId === 'HK-02').length
  const trashEvents = hkEvents.filter(r => r.scenarioId === 'HK-04').length
  const scatterEvents = hkEvents.filter(r => r.scenarioId === 'HK-03').length

  const roadIssues = logEvents.length + hkEvents.filter(r => r.roiType === 'ROAD').length
  const cleanliness = Math.max(0, Math.min(100, 100 - roadIssues * 4))

  return {
    logistics: {
      occupiedRoutes: logEvents.length,
      avgOccupancyMinutes: avgOccupancy,
      topOccupancyLocation: topZone?.[0] ?? '—',
      unhandledCount: logEvents.filter(isUnhandledEvent).length,
    },
    housekeeping: {
      roadCleanlinessPercent: cleanliness,
      mudAreaSqm: mudEvents * 4.2,
      waterAreaSqm: waterEvents * 2.8,
      trashLocations: trashEvents,
      scatteredMaterialLocations: scatterEvents,
      unhandledCount: hkEvents.filter(isUnhandledEvent).length,
    },
    totalEvents: today.length,
    closedCount: today.filter(r => r.status === 'CLOSED').length,
  }
}

export function computeHousekeepingGroupStats(
  records: HousekeepingEventRecord[],
): HousekeepingGroupStats[] {
  const today = records.filter(r => isToday(r))

  return (['LOG', 'HK'] as const).map(groupId => {
    const groupRecords = today.filter(r => r.groupId === groupId)
    const scenarios = HOUSEKEEPING_AI_SCENARIOS.filter(s => s.groupId === groupId)

    return {
      groupId,
      total: groupRecords.length,
      unhandled: groupRecords.filter(isUnhandledEvent).length,
      trend: 0,
      scenarioBreakdown: scenarios.map(sc => {
        const items = groupRecords.filter(r => r.scenarioId === sc.id)
        const top = items[0]
        return {
          scenarioId: sc.id,
          name: sc.name,
          count: items.length,
          severity: top?.severity ?? sc.defaultSeverity,
        }
      }),
    }
  })
}

export function getPriorityHousekeepingEvents(
  records: HousekeepingEventRecord[],
): HousekeepingEventRecord[] {
  return records.filter(r => isToday(r) && isUnhandledEvent(r))
}

export { HOUSEKEEPING_AI_CONFIG, HOUSEKEEPING_SCENARIO_MAP }
