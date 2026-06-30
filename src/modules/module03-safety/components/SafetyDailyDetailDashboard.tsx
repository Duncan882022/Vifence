import { useState, type ReactNode } from 'react'
import { AlertTriangle, ShieldAlert, Clock, CheckCircle2, MapPin, Building2, ShieldCheck } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { SafetyDailySummary } from '../services/safetyKpi.service'
import { SAFETY_VIOLATIONS, getViolationSeverity, VIOLATION_SEVERITY_LABELS, VIOLATION_TYPE_LABELS } from '../data/safetyViolations'
import { formatDateTime } from '@/utils/format'
import { getPpeLevel, formatPpeScore } from '../utils/safetyUiHelpers'
import { resolveWorkerClickTarget } from '../services/safetyEntity.service'
import { SafetyContractorPanel } from './SafetyContractorPanel'
import { ViolationTypeIcon } from './ViolationTypeIcon'
import { ViolationTypeChips } from './ViolationTypeChips'
import { PpeComplianceTooltip, PpeLevelIcon } from './PpeComplianceTooltip'
import { Avatar } from '@/components/common/Avatar/Avatar'
import { getPersonAvatarColor, getPersonAvatarUrl } from '@/data/personAvatars'

type DetailTab = 'all' | 'pending' | 'processed' | 'high' | 'medium' | 'low' | 'zones' | 'contractors'

const TABS: { key: DetailTab; label: string; shortLabel: string; icon: typeof AlertTriangle }[] = [
  { key: 'all', label: 'Tất cả vi phạm', shortLabel: 'Tất cả', icon: ShieldAlert },
  { key: 'pending', label: 'Chưa xử lý', shortLabel: 'Chưa XL', icon: Clock },
  { key: 'processed', label: 'Đã xử lý', shortLabel: 'Đã XL', icon: CheckCircle2 },
  { key: 'high', label: 'Mức cao', shortLabel: 'Cao', icon: AlertTriangle },
  { key: 'medium', label: 'Mức trung bình', shortLabel: 'TB', icon: AlertTriangle },
  { key: 'low', label: 'Mức thấp', shortLabel: 'Thấp', icon: ShieldAlert },
  { key: 'zones', label: 'Theo khu vực', shortLabel: 'Khu vực', icon: MapPin },
  { key: 'contractors', label: 'Nhà thầu', shortLabel: 'NT', icon: Building2 },
]

function StatTile({
  label,
  value,
  sub,
  tone = 'default',
  headerExtra,
}: {
  label: string
  value: string | number | ReactNode
  sub?: string
  tone?: 'default' | 'green' | 'orange' | 'red' | 'amber'
  headerExtra?: ReactNode
}) {
  const toneClass = {
    default: 'text-foreground',
    green: 'text-green-400',
    orange: 'text-orange-400',
    red: 'text-red-400',
    amber: 'text-amber-400',
  }[tone]

  return (
    <div className="bg-[#0b0f1a] border border-[#1e2433] rounded-lg px-3 py-2.5">
      <div className="flex items-center justify-between gap-1 min-w-0">
        <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide truncate">{label}</p>
        {headerExtra}
      </div>
      <p className={cn('text-xl font-bold tabular-nums mt-0.5', toneClass)}>{value}</p>
      {sub && <p className="text-[9px] text-muted-foreground/70 mt-0.5 tabular-nums">{sub}</p>}
    </div>
  )
}

interface SafetyDailyDetailDashboardProps {
  summary: SafetyDailySummary
  onSelectWorker?: (workerIdOrName: string) => void
  onSelectContractor?: (contractorName: string) => void
}

export function SafetyDailyDetailDashboard({
  summary,
  onSelectWorker,
  onSelectContractor,
}: SafetyDailyDetailDashboardProps) {
  const [tab, setTab] = useState<DetailTab>('all')
  const { today, yesterday, current, previous, periodLabel } = summary

  const violations = SAFETY_VIOLATIONS.filter(v => {
    if (tab === 'pending') return v.status === 'pending'
    if (tab === 'processed') return v.status === 'processed'
    if (tab === 'high') return getViolationSeverity(v.type) === 'high'
    if (tab === 'medium') return getViolationSeverity(v.type) === 'medium'
    if (tab === 'low') return getViolationSeverity(v.type) === 'low'
    return true
  }).slice(0, 12)

  const showTodayOverview = tab === 'all' || tab === 'pending' || tab === 'processed'

  return (
    <div className="flex flex-col h-full min-h-0">
      {showTodayOverview && (
        <div className="shrink-0 px-3 pt-3 pb-2 border-b border-[#1e2433]/60">
          <div className="flex items-center gap-1.5 mb-2">
            <ShieldCheck className="w-3 h-3 text-green-400" />
            <p className="text-[9px] text-muted-foreground">
              Hôm nay · <span className="font-semibold text-foreground">{today.dateLabel}</span>
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(() => {
              const ppeLevel = getPpeLevel(today.ppeCompliance)
              const ppeTone = ppeLevel.level === 'high' ? 'green' : ppeLevel.level === 'medium' ? 'amber' : 'red'
              return (
                <StatTile
                  label="Tuân thủ PPE"
                  value={
                    <span className="inline-flex items-center gap-1.5">
                      <PpeLevelIcon score={today.ppeCompliance} size="xs" />
                      {formatPpeScore(today.ppeCompliance)}%
                    </span>
                  }
                  sub={`Mức ${ppeLevel.label} · Hôm qua: ${formatPpeScore(yesterday.ppeCompliance)}%`}
                  tone={ppeTone}
                  headerExtra={<PpeComplianceTooltip score={today.ppeCompliance} iconClassName="w-2.5 h-2.5" />}
                />
              )
            })()}
            <StatTile
              label="Vi phạm hôm nay"
              value={
                <div className="flex flex-col gap-1">
                  <span>{today.violationsToday}</span>
                  {today.violationsToday > 0 && (
                    <ViolationTypeChips stats={today} size="xs" />
                  )}
                </div>
              }
              sub={`Hôm qua: ${yesterday.violationsToday}`}
              tone="orange"
            />
            <StatTile
              label="Camera hoạt động"
              value={`${today.activeCameras}/${today.totalCameras}`}
              sub="OCP1 CCTV"
              tone="default"
            />
            <StatTile
              label="Xử phạt"
              value={
                <span className="inline-flex items-baseline gap-1">
                  <span className="text-green-400">{today.penaltiesResolved}</span>
                  <span className="text-muted-foreground/50 text-sm font-normal">/</span>
                  <span className={cn(
                    'text-base',
                    today.penaltiesPending > 0 ? 'text-red-400' : 'text-green-400',
                  )}>
                    {today.penaltiesPending}
                  </span>
                </span>
              }
              sub="Đã xử lý / Chưa xử lý"
              tone={today.penaltiesPending > 0 ? 'amber' : 'green'}
            />
          </div>
        </div>
      )}

      {(tab === 'all' || tab === 'pending' || tab === 'processed') && (
        <div className="shrink-0 px-3 py-2 border-b border-[#1e2433]/60">
          <p className="text-[9px] text-muted-foreground mb-2">
            Trạng thái xử lý · <span className="font-semibold text-foreground">{periodLabel}</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <StatTile
              label="Chưa xử lý"
              value={current.pending}
              sub={`Kỳ trước: ${previous.pending}`}
              tone="orange"
            />
            <StatTile
              label="Đã xử lý"
              value={current.processed}
              sub={`Kỳ trước: ${previous.processed}`}
              tone="green"
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
                  ? 'border-primary text-primary'
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
                <span className="text-orange-400 font-semibold tabular-nums shrink-0">{zone.count}</span>
              </div>
            ))}
          </div>
        ) : tab === 'contractors' ? (
          <SafetyContractorPanel
            stats={summary.stats}
            periodLabel={periodLabel}
            onSelectContractor={onSelectContractor}
            onSelectWorker={onSelectWorker}
          />
        ) : (
          <div className="space-y-1.5">
            {violations.length === 0 && (
              <p className="text-[11px] text-muted-foreground text-center py-6">Không có vi phạm</p>
            )}
            {violations.map(v => {
              const sev = getViolationSeverity(v.type)
              const workerTarget = resolveWorkerClickTarget(v)
              return (
                <div
                  key={v.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-[#1e2433]/60 bg-[#0b0f1a] text-[10px]"
                >
                  {workerTarget && v.workerName && onSelectWorker ? (
                    <button
                      type="button"
                      onClick={() => onSelectWorker(workerTarget)}
                      className="rounded-full cursor-pointer hover:ring-2 hover:ring-primary/40 transition-shadow shrink-0"
                      title={`Xem hồ sơ ${v.workerName}`}
                    >
                      <Avatar
                        name={v.workerName}
                        color={getPersonAvatarColor(v.workerName)}
                        src={getPersonAvatarUrl(workerTarget, v.workerName)}
                        size="sm"
                      />
                    </button>
                  ) : (
                    <ViolationTypeIcon type={v.type} size="sm" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">
                      {workerTarget && onSelectWorker ? (
                        <button
                          type="button"
                          onClick={() => onSelectWorker(workerTarget)}
                          className="hover:text-primary hover:underline underline-offset-2 decoration-dotted transition-colors cursor-pointer"
                        >
                          {v.workerName ?? '—'}
                        </button>
                      ) : (
                        v.workerName ?? '—'
                      )}
                      {' · '}
                      {VIOLATION_TYPE_LABELS[v.type]}
                    </p>
                    <p className="text-muted-foreground/70 truncate tabular-nums">
                      {formatDateTime(v.timestamp)} · {v.location}
                      {v.contractorName && onSelectContractor && (
                        <>
                          {' · '}
                          <button
                            type="button"
                            onClick={() => onSelectContractor(v.contractorName!)}
                            className="text-primary/75 hover:text-primary hover:underline underline-offset-2 decoration-dotted transition-colors cursor-pointer"
                          >
                            {v.contractorName}
                          </button>
                        </>
                      )}
                    </p>
                  </div>
                  <span className={cn(
                    'shrink-0 text-[8px] font-bold px-1 py-0.5 rounded',
                    sev === 'high' ? 'bg-red-500/15 text-red-400'
                      : sev === 'medium' ? 'bg-orange-500/15 text-orange-400'
                        : 'bg-amber-500/15 text-amber-400',
                  )}>
                    {VIOLATION_SEVERITY_LABELS[sev]}
                  </span>
                  <span className={cn(
                    'shrink-0 text-[8px] font-bold',
                    v.status === 'pending' ? 'text-red-400' : 'text-green-400',
                  )}>
                    {v.status === 'pending' ? 'Chưa XL' : 'Đã XL'}
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
