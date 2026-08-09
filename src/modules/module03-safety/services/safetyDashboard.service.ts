import type {
  AlertSeverity,
  SafetyDashboardFilters,
  SafetyDashboardKpis,
  SafetyGroupId,
  SafetyGroupStats,
  SafetyViolationRecord,
  SafetyWorkflowStats,
  ViolationStatus,
  ZoneRiskLevel,
} from '../types/safety.types'
import { MONITORING_DEVICES } from '../data/monitoringDevices'
import { computeSafetyDeviceKpis } from '../data/safetyCameras'
import { SAFETY_GROUPS } from '../data/safetyGroups'
import { getScenariosForGroup } from '../data/safetyScenarios'
import { isImplementedSafetyScenario } from '../data/implementedSafetyCatalog'
import {
  getSafetyTodayDate,
  getSafetyYesterdayDate,
  SAFETY_DEMO_MONTH_START,
  SAFETY_DEMO_WEEK_START,
} from '../data/safetyDemoDate'
import { isOpenStatus } from '../data/safetyViolationRecords'
import { SAFETY_ZONES } from '../data/safetyZones'
import {
  getEventSubjectType,
  getSubject,
  isBodycamVerification,
  isManagementAlert,
  isPersonalViolation,
  isUnassigned,
  matchesEventSearch,
} from '../utils/eventSubject'
import { getSafetyEventsSnapshot } from '../store/safetyEventsStore'
import { countAlertStatusBuckets } from '../utils/safetyDashboardUi'

const NEAR_DUE_HOURS = 4

export function getAllSafetyRecords(): SafetyViolationRecord[] {
  return getSafetyEventsSnapshot()
}

function isTodayRecord(detectedAt: string): boolean {
  return detectedAt.startsWith(getSafetyTodayDate())
}

/** Chỉ sự kiện AI live + kịch bản đã triển khai */
export function filterLiveSafetyRecords(records: SafetyViolationRecord[]): SafetyViolationRecord[] {
  return records.filter(v => isImplementedSafetyScenario(v.scenarioId))
}

export function filterTodayLiveRecords(records: SafetyViolationRecord[]): SafetyViolationRecord[] {
  return filterLiveSafetyRecords(records).filter(v => isTodayRecord(v.detectedAt))
}

export function mergeViolationStatusOverrides(
  records: SafetyViolationRecord[],
  overrides: Record<string, ViolationStatus>,
): SafetyViolationRecord[] {
  const keys = Object.keys(overrides)
  if (keys.length === 0) return records
  return records.map(r => {
    const next = overrides[r.id]
    return next ? { ...r, status: next } : r
  })
}

function matchesDateRange(
  detectedAt: string,
  range?: SafetyDashboardFilters['dateRange'],
): boolean {
  if (range === 'today') return isTodayRecord(detectedAt)
  if (range === 'week') return detectedAt >= SAFETY_DEMO_WEEK_START
  if (range === 'month') return detectedAt >= SAFETY_DEMO_MONTH_START
  return true
}

function matchesQuickFilter(record: SafetyViolationRecord, quick?: SafetyDashboardFilters['quickFilter']): boolean {
  if (!quick) return true
  switch (quick) {
    case 'critical':
      return record.severity === 'CRITICAL'
    case 'pending_verification':
      return record.status === 'PENDING_VERIFICATION'
    case 'overdue':
      return record.status === 'OVERDUE'
    case 'unassigned':
      return isUnassigned(record)
    case 'personal_violation':
      return isPersonalViolation(record)
    case 'management_alert':
      return isManagementAlert(record)
    case 'drone_detected':
      return record.sourceType === 'DRONE' || record.sourceType === 'DRONE_RTK'
    case 'camera_detected':
      return record.sourceType === 'FIXED_CAMERA' || record.sourceType === 'PTZ_CAMERA'
    case 'bodycam_verification':
      return isBodycamVerification(record)
    default:
      return true
  }
}

export function filterViolations(
  records: SafetyViolationRecord[],
  filters: SafetyDashboardFilters,
): SafetyViolationRecord[] {
  return records.filter(v => {
    if (filters.zoneId && v.zoneId !== filters.zoneId) return false
    if (filters.groupId && v.groupId !== filters.groupId) return false
    if (filters.scenarioId && v.scenarioId !== filters.scenarioId) return false
    if (filters.eventSubjectType && getEventSubjectType(v) !== filters.eventSubjectType) return false
    if (filters.deviceType && v.sourceType !== filters.deviceType) return false
    if (filters.severity && v.severity !== filters.severity) return false
    if (filters.responsibleUnit && getSubject(v).responsibleUnit !== filters.responsibleUnit) return false

    const contractor = getSubject(v).contractorName ?? getSubject(v).siteContractor ?? getSubject(v).constructionUnit ?? v.contractorName
    if (filters.contractorId && contractor !== filters.contractorId) return false

    const statusFilter = filters.advancedStatus ?? filters.status
    if (statusFilter === 'OPEN' && !isOpenStatus(v.status)) return false
    if (statusFilter && statusFilter !== 'OPEN' && v.status !== statusFilter) return false

    if (!matchesQuickFilter(v, filters.quickFilter)) return false
    if (!matchesDateRange(v.detectedAt, filters.dateRange)) return false
    if (!isImplementedSafetyScenario(v.scenarioId)) return false
    if (filters.searchQuery && !matchesEventSearch(v, filters.searchQuery)) return false

    return true
  })
}

export function computeDashboardKpis(records: SafetyViolationRecord[]): SafetyDashboardKpis {
  const todayFiltered = filterTodayLiveRecords(records)
  const yesterday = filterLiveSafetyRecords(records).filter(
    v => v.detectedAt.startsWith(getSafetyYesterdayDate()),
  )
  const todayBuckets = countAlertStatusBuckets(todayFiltered)
  const yesterdayBuckets = countAlertStatusBuckets(yesterday)
  const openToday = todayFiltered.filter(v => isOpenStatus(v.status))
  const closedToday = todayFiltered.filter(v => v.status === 'CLOSED')
  const now = Date.now()

  const nearDue = openToday.filter(v => {
    if (!v.dueAt) return false
    const due = new Date(v.dueAt).getTime()
    return due > now && due - now <= NEAR_DUE_HOURS * 3600_000
  }).length

  const deviceKpis = computeSafetyDeviceKpis()
  const { deviceActiveCount, deviceTotalCount, deviceBreakdown, cameraCount, bodycamCount, droneCount, monitoredZones } = deviceKpis

  const yesterdayClosed = yesterday.filter(v => v.status === 'CLOSED')
  const yesterdayClosedCount = yesterdayClosed.length
  const yesterdayClosedRate = yesterday.length
    ? Math.round((yesterdayClosedCount / yesterday.length) * 100)
    : 0

  const countStatus = (s: ViolationStatus) => todayFiltered.filter(v => v.status === s).length

  return {
    monitoredZones,
    cameraCount,
    droneCount,
    bodycamCount,
    radarCount: 0,
    deviceActiveCount,
    deviceTotalCount,
    deviceBreakdown,
    todayViolations: todayFiltered.length,
    yesterdayViolations: yesterday.length,
    yesterdayDeviceActiveCount: deviceActiveCount,
    yesterdayDeviceTotalCount: deviceTotalCount,
    yesterdayClosedCount,
    yesterdayClosedRate,
    yesterdayGroupTotal: yesterday.length,
    criticalCount: todayFiltered.filter(v => v.severity === 'CRITICAL').length,
    violationCount: todayFiltered.filter(v => v.severity === 'VIOLATION').length,
    warningCount: todayFiltered.filter(v => v.severity === 'WARNING').length,
    manualHandledCount: todayBuckets.manualHandledCount,
    unhandledCount: todayBuckets.unhandledCount,
    aiSpeakerHandledCount: todayBuckets.aiSpeakerHandledCount,
    aiAutoHandledCount: todayBuckets.aiAutoHandledCount,
    handledTotalCount: todayBuckets.handledTotalCount,
    handledRate: todayBuckets.handledRate,
    yesterdayHandledTotalCount: yesterdayBuckets.handledTotalCount,
    yesterdayHandledRate: yesterdayBuckets.handledRate,
    detectedCount: countStatus('DETECTED'),
    pendingVerificationCount: countStatus('PENDING_VERIFICATION'),
    confirmedCount: countStatus('CONFIRMED'),
    assignedCount: countStatus('ASSIGNED'),
    inProgressCount: countStatus('IN_PROGRESS'),
    pendingRecheckCount: countStatus('PENDING_RECHECK'),
    closedCount: closedToday.length,
    overdueCount: countStatus('OVERDUE'),
    nearDueCount: nearDue,
    openCount: openToday.length,
    closedRate: todayFiltered.length
      ? Math.round((countAlertStatusBuckets(todayFiltered).handledTotalCount / todayFiltered.length) * 100)
      : 0,
  }
}

/** Thống kê nhóm — count từ sự kiện AI hôm nay (12 kịch bản triển khai) */
function scenarioSeverityForGroup(
  groupToday: SafetyViolationRecord[],
  scenarioId: string,
): AlertSeverity | null {
  const items = groupToday.filter(v => v.scenarioId === scenarioId)
  if (items.length === 0) return null

  const rank: Record<AlertSeverity, number> = { CRITICAL: 0, VIOLATION: 1, WARNING: 2 }
  return items.reduce<AlertSeverity>(
    (worst, v) => (rank[v.severity] < rank[worst] ? v.severity : worst),
    items[0].severity,
  )
}

export function computeGroupStats(
  records: SafetyViolationRecord[],
  sourceRecords: SafetyViolationRecord[] = records,
): SafetyGroupStats[] {
  const today = filterTodayLiveRecords(records)
  const yesterday = filterLiveSafetyRecords(sourceRecords).filter(
    v => v.detectedAt.startsWith(getSafetyYesterdayDate()),
  )

  return SAFETY_GROUPS.map(group => {
    const groupToday = today.filter(v => v.groupId === group.id)
    const groupYesterday = yesterday.filter(v => v.groupId === group.id)
    const scenarioCounts = new Map<string, number>()

    groupToday.forEach(v => {
      scenarioCounts.set(v.scenarioId, (scenarioCounts.get(v.scenarioId) ?? 0) + 1)
    })

    const scenarioBreakdown = getScenariosForGroup(group.id).map(sc => ({
      scenarioId: sc.id,
      name: sc.name,
      count: scenarioCounts.get(sc.id) ?? 0,
      severity: scenarioSeverityForGroup(groupToday, sc.id) ?? sc.defaultSeverity,
    }))

    return {
      groupId: group.id,
      total: groupToday.length,
      warning: groupToday.filter(v => v.severity === 'WARNING').length,
      violation: groupToday.filter(v => v.severity === 'VIOLATION').length,
      critical: groupToday.filter(v => v.severity === 'CRITICAL').length,
      open: groupToday.filter(v => isOpenStatus(v.status)).length,
      trend: groupToday.length - groupYesterday.length,
      scenarioBreakdown,
    }
  })
}

export function computeWorkflowStats(records: SafetyViolationRecord[]): SafetyWorkflowStats {
  const today = records.filter(v => isTodayRecord(v.detectedAt))
  const count = (s: ViolationStatus) => today.filter(v => v.status === s).length
  const closed = count('CLOSED')
  const open = today.filter(v => isOpenStatus(v.status))

  return {
    detected: count('DETECTED'),
    pendingVerification: count('PENDING_VERIFICATION'),
    confirmed: count('CONFIRMED'),
    assigned: count('ASSIGNED'),
    inProgress: count('IN_PROGRESS'),
    pendingRecheck: count('PENDING_RECHECK'),
    closed,
    overdue: count('OVERDUE'),
    nearDue: open.filter(v => v.dueAt && new Date(v.dueAt).getTime() > Date.now()).length,
    avgResolutionHours: 4.2,
    slaCloseRate: today.length ? Math.round((closed / today.length) * 100) : 0,
  }
}

export function computeZoneRiskLevels(records: SafetyViolationRecord[]): Map<string, ZoneRiskLevel> {
  const today = records.filter(v => isTodayRecord(v.detectedAt))
  const map = new Map<string, ZoneRiskLevel>()

  SAFETY_ZONES.forEach(zone => {
    const zoneEvents = today.filter(v => v.zoneId === zone.id)
    const open = zoneEvents.filter(v => isOpenStatus(v.status))
    const critical = zoneEvents.filter(v => v.severity === 'CRITICAL')
    const offlineDevices = MONITORING_DEVICES.filter(
      d => d.zoneIds.includes(zone.id) && d.status === 'OFFLINE',
    ).length

    if (offlineDevices > 0 && zoneEvents.length === 0) {
      map.set(zone.id, 'NO_DATA')
    } else if (critical.some(v => isOpenStatus(v.status))) {
      map.set(zone.id, 'CRITICAL')
    } else if (open.length >= 3) {
      map.set(zone.id, 'HIGH')
    } else if (open.length >= 1) {
      map.set(zone.id, 'WARNING')
    } else {
      map.set(zone.id, 'NORMAL')
    }
  })

  return map
}

export function getPriorityAlerts(records: SafetyViolationRecord[]): {
  all: SafetyViolationRecord[]
  warning: SafetyViolationRecord[]
  violation: SafetyViolationRecord[]
  critical: SafetyViolationRecord[]
} {
  const today = filterTodayLiveRecords(records)
    .sort((a, b) => b.detectedAt.localeCompare(a.detectedAt))

  return {
    all: today,
    warning: today.filter(v => v.severity === 'WARNING'),
    violation: today.filter(v => v.severity === 'VIOLATION'),
    critical: today.filter(v => v.severity === 'CRITICAL'),
  }
}

export function getContractorOptions(records: SafetyViolationRecord[]): string[] {
  const names = records.flatMap(v => {
    const s = getSubject(v)
    return [s.contractorName, s.siteContractor, s.constructionUnit, s.managementUnit, v.contractorName]
  }).filter(Boolean) as string[]
  return [...new Set(names)]
}

export function getScenarioForGroup(groupId: SafetyGroupId) {
  return getScenariosForGroup(groupId)
}

export function getZoneViolationsToday(zoneId: string, records: SafetyViolationRecord[]) {
  return records.filter(v => v.zoneId === zoneId && isTodayRecord(v.detectedAt))
}

export function getZoneOpenCount(zoneId: string, records: SafetyViolationRecord[]) {
  return getZoneViolationsToday(zoneId, records).filter(v => isOpenStatus(v.status)).length
}

export function getFilteredTodayRecords(filters: SafetyDashboardFilters): SafetyViolationRecord[] {
  return filterViolations([], { ...filters, dateRange: filters.dateRange ?? 'today' })
}
