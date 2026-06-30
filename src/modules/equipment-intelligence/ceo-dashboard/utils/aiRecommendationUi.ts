import { AlertCircle, AlertTriangle, Info } from 'lucide-react'
import { CEO_DASHBOARD_MOCK } from '../data/mockCeoDashboard'
import type { AiRecommendationRow, AiSeverity, MmtbRow } from '../types'

export const AI_SEV: Record<AiSeverity, {
  Icon: typeof AlertCircle
  cls: string
  bg: string
  border: string
  label: string
}> = {
  critical: {
    Icon: AlertCircle,
    cls: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/25',
    label: 'Nghiêm trọng',
  },
  high: {
    Icon: AlertTriangle,
    cls: 'text-orange-400',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/25',
    label: 'Cao',
  },
  medium: {
    Icon: AlertTriangle,
    cls: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/25',
    label: 'Trung bình',
  },
  info: {
    Icon: Info,
    cls: 'text-sky-400',
    bg: 'bg-sky-500/10',
    border: 'border-sky-500/25',
    label: 'Thông tin',
  },
}

export function aiRiskColor(score: number): string {
  if (score >= 75) return 'text-red-400'
  if (score >= 60) return 'text-amber-400'
  return 'text-muted-foreground'
}

const REGION_NAMES = Object.fromEntries(
  CEO_DASHBOARD_MOCK.regions.map(r => [r.id, r.name]),
) as Record<string, string>

export function getMachineForRecommendation(machineCode: string): MmtbRow | undefined {
  return CEO_DASHBOARD_MOCK.machines.find(m => m.machineCode === machineCode)
}

export function getRegionName(regionId: string): string {
  return REGION_NAMES[regionId] ?? regionId
}

export function severityLabel(severity: AiSeverity): string {
  return AI_SEV[severity].label
}

export function formatEngineHours(hours: number): string {
  return `${hours.toLocaleString('vi-VN')} h`
}

export function buildMetricDetails(item: AiRecommendationRow) {
  if (item.metricDetails?.length) return item.metricDetails
  return item.abnormalMetrics.map(raw => {
    const match = raw.match(/^(.+?)\s*([+-]?\d+%?)$/)
    return {
      metric: match?.[1]?.replace(/_/g, ' ') ?? raw,
      current: '—',
      threshold: '—',
      deviation: match?.[2] ?? '—',
      direction: (raw.includes('-') ? 'down' : 'up') as 'up' | 'down',
    }
  })
}
