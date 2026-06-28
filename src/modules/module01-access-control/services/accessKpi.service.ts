import type { KPIData } from '@/types/api'
import type { AccessDayCounts, AccessPlaybackMarker } from '@/types/access'
import { ACCESS_EXCEPTIONS } from '../data/accessExceptions'
import { ACCESS_EVENTS } from '../data/accessEvents'

export const DEMO_ACCESS_COUNTS: AccessDayCounts = {
  people: 128,
  vehicles: 42,
  contractors: 12,
  exceptions: 5,
}

export const DEMO_ACCESS_COUNTS_YESTERDAY: AccessDayCounts = {
  people: 116,
  vehicles: 39,
  contractors: 11,
  exceptions: 3,
}

export interface AccessDailySummary {
  today: AccessDayCounts
  yesterday: AccessDayCounts
  metrics: KPIData[]
}

function delta(current: number, previous: number): Pick<KPIData, 'change' | 'changeType'> {
  const change = current - previous
  if (change === 0) return { change: 0, changeType: 'neutral' }
  return { change, changeType: change > 0 ? 'increase' : 'decrease' }
}

function buildMetrics(today: AccessDayCounts, yesterday: AccessDayCounts): KPIData[] {
  const defs: { label: string; key: keyof AccessDayCounts; higherIsBetter: boolean }[] = [
    { label: 'Người', key: 'people', higherIsBetter: true },
    { label: 'Xe', key: 'vehicles', higherIsBetter: true },
    { label: 'Nhà thầu', key: 'contractors', higherIsBetter: true },
    { label: 'Ngoại lệ', key: 'exceptions', higherIsBetter: false },
  ]

  return defs.map(({ label, key, higherIsBetter }) => ({
    label,
    value: today[key],
    ...delta(today[key], yesterday[key]),
    previousValue: yesterday[key],
    higherIsBetter,
    changeUnit: 'so với hôm qua',
  }))
}

export function computeAccessDailySummary(
  today: AccessDayCounts = DEMO_ACCESS_COUNTS,
  yesterday: AccessDayCounts = DEMO_ACCESS_COUNTS_YESTERDAY,
): AccessDailySummary {
  return { today, yesterday, metrics: buildMetrics(today, yesterday) }
}

export function computeAccessCountsFromData(): AccessDayCounts {
  const peopleInside = ACCESS_EVENTS.filter(e => e.subjectType === 'person' && e.presence === 'inside').length
  const vehiclesToday = ACCESS_EVENTS.filter(e => e.subjectType === 'vehicle').length
  const contractors = new Set(
    ACCESS_EVENTS
      .filter(e => e.subjectType === 'person')
      .map(e => e.contractorOrType),
  ).size

  return {
    people: Math.max(DEMO_ACCESS_COUNTS.people, peopleInside + 100),
    vehicles: Math.max(DEMO_ACCESS_COUNTS.vehicles, vehiclesToday + 30),
    contractors: Math.max(DEMO_ACCESS_COUNTS.contractors, contractors),
    exceptions: ACCESS_EXCEPTIONS.length,
  }
}

export const ACCESS_PLAYBACK_MARKERS: AccessPlaybackMarker[] = [
  { id: 'm1', startHour: 6.5, endHour: 7.2, kind: 'vehicle', label: 'Xe bê tông' },
  { id: 'm2', startHour: 7.4, endHour: 7.8, kind: 'person', label: 'Nguyễn Văn An' },
  { id: 'm3', startHour: 7.7, endHour: 8.0, kind: 'person', label: 'Trần Văn Bình' },
  { id: 'm4', startHour: 8.1, endHour: 8.4, kind: 'vehicle', label: '51D-123.45' },
  { id: 'm5', startHour: 8.2, endHour: 8.5, kind: 'exception', label: 'Khách chưa ĐK' },
  { id: 'm6', startHour: 9.0, endHour: 9.5, kind: 'person', label: 'Điểm danh ca sáng' },
  { id: 'm7', startHour: 11.3, endHour: 11.8, kind: 'exception', label: 'Xe ngoài giờ' },
  { id: 'm8', startHour: 11.5, endHour: 12.0, kind: 'person', label: 'Ca Điện cơ E' },
]
