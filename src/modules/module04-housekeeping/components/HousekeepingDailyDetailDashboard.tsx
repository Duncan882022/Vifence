import { useState } from 'react'
import { AlertTriangle, Sparkles, Clock, MapPin, Building2 } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { HousekeepingDailySummary } from '../services/housekeepingKpi.service'
import {
  HOUSEKEEPING_ISSUES,
  getIssueSeverity,
  ISSUE_SEVERITY_LABELS,
  ISSUE_TYPE_LABELS,
} from '../data/housekeepingIssues'
import { formatDateTime } from '@/utils/format'
import { HousekeepingContractorPanel } from './HousekeepingContractorPanel'

type DetailTab = 'all' | 'pending' | 'high' | 'medium' | 'low' | 'zones' | 'contractors'

const TABS: { key: DetailTab; label: string; shortLabel: string; icon: typeof AlertTriangle }[] = [
  { key: 'all', label: 'Tất cả sự cố', shortLabel: 'Tất cả', icon: Sparkles },
  { key: 'pending', label: 'Chưa xử lý', shortLabel: 'Chưa XL', icon: Clock },
  { key: 'high', label: 'Mức cao', shortLabel: 'Cao', icon: AlertTriangle },
  { key: 'medium', label: 'Mức trung bình', shortLabel: 'TB', icon: AlertTriangle },
  { key: 'low', label: 'Mức thấp', shortLabel: 'Thấp', icon: Sparkles },
  { key: 'zones', label: 'Theo khu vực', shortLabel: 'Khu vực', icon: MapPin },
  { key: 'contractors', label: 'Nhà thầu', shortLabel: 'NT', icon: Building2 },
]

function SeverityStatTile({
  label,
  value,
  previous,
  tone,
}: {
  label: string
  value: number
  previous: number
  tone: 'emerald' | 'cyan' | 'teal'
}) {
  const toneClass = {
    emerald: 'text-emerald-400',
    cyan: 'text-cyan-400',
    teal: 'text-teal-400',
  }[tone]

  return (
    <div className="bg-[#0b0f1a] border border-[#1e2433] rounded-lg px-3 py-2.5">
      <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide">{label}</p>
      <p className={cn('text-xl font-bold tabular-nums mt-0.5', toneClass)}>{value}</p>
      <p className="text-[9px] text-muted-foreground/70 mt-0.5 tabular-nums">Kỳ trước: {previous}</p>
    </div>
  )
}

interface HousekeepingDailyDetailDashboardProps {
  summary: HousekeepingDailySummary
}

export function HousekeepingDailyDetailDashboard({ summary }: HousekeepingDailyDetailDashboardProps) {
  const [tab, setTab] = useState<DetailTab>('all')
  const { current, previous, periodLabel } = summary

  const issues = HOUSEKEEPING_ISSUES.filter(issue => {
    if (tab === 'pending') return issue.status === 'pending'
    if (tab === 'high') return getIssueSeverity(issue.type) === 'high'
    if (tab === 'medium') return getIssueSeverity(issue.type) === 'medium'
    if (tab === 'low') return getIssueSeverity(issue.type) === 'low'
    return true
  }).slice(0, 12)

  const showSeverityOverview = tab === 'all' || tab === 'high' || tab === 'medium' || tab === 'low'

  return (
    <div className="flex flex-col h-full min-h-0">
      {showSeverityOverview && (
        <div className="shrink-0 px-3 pt-3 pb-2 border-b border-[#1e2433]/60">
          <p className="text-[9px] text-muted-foreground mb-2">
            Phân loại mức độ · <span className="font-semibold text-foreground">{periodLabel}</span>
          </p>
          <div className="grid grid-cols-3 gap-2">
            <SeverityStatTile
              label={ISSUE_SEVERITY_LABELS.high}
              value={current.high}
              previous={previous.high}
              tone="emerald"
            />
            <SeverityStatTile
              label={ISSUE_SEVERITY_LABELS.medium}
              value={current.medium}
              previous={previous.medium}
              tone="cyan"
            />
            <SeverityStatTile
              label={ISSUE_SEVERITY_LABELS.low}
              value={current.low}
              previous={previous.low}
              tone="teal"
            />
          </div>
        </div>
      )}

      <div className="flex border-b border-[#1e2433] shrink-0 overflow-x-auto">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-2 text-[10px] font-medium whitespace-nowrap border-b-2 -mb-px transition-colors',
                tab === t.key
                  ? 'border-teal-500 text-teal-400'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="w-3 h-3 shrink-0" />
              <span className="sm:hidden">{t.shortLabel}</span>
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          )
        })}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-3">
        {tab === 'zones' ? (
          <div className="space-y-2">
            {summary.stats.topZones.slice(0, 8).map((zone, i) => (
              <div key={zone.name} className="flex items-center gap-2 text-[10px]">
                <span className="text-muted-foreground w-4 shrink-0">{i + 1}</span>
                <span className="flex-1 truncate text-foreground">{zone.name}</span>
                <span className="text-teal-400 font-semibold tabular-nums shrink-0">{zone.count}</span>
              </div>
            ))}
          </div>
        ) : tab === 'contractors' ? (
          <HousekeepingContractorPanel stats={summary.stats} periodLabel={periodLabel} />
        ) : (
          <div className="space-y-1.5">
            {issues.length === 0 && (
              <p className="text-[11px] text-muted-foreground text-center py-6">Không có sự cố</p>
            )}
            {issues.map(issue => {
              const sev = getIssueSeverity(issue.type)
              return (
                <div
                  key={issue.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-[#1e2433]/60 bg-[#0b0f1a] text-[10px]"
                >
                  <span className={cn(
                    'shrink-0 text-[8px] font-bold px-1 py-0.5 rounded',
                    sev === 'high' ? 'bg-emerald-500/15 text-emerald-400'
                      : sev === 'medium' ? 'bg-cyan-500/15 text-cyan-400'
                        : 'bg-teal-500/15 text-teal-400',
                  )}>
                    {ISSUE_SEVERITY_LABELS[sev]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">
                      {issue.workerName ?? '—'} · {ISSUE_TYPE_LABELS[issue.type]}
                    </p>
                    <p className="text-muted-foreground/70 truncate tabular-nums">
                      {formatDateTime(issue.timestamp)} · {issue.location}
                    </p>
                  </div>
                  <span className={cn(
                    'shrink-0 text-[8px] font-bold',
                    issue.status === 'pending' ? 'text-cyan-400' : 'text-green-400',
                  )}>
                    {issue.status === 'pending' ? 'Chưa XL' : 'Đã XL'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
