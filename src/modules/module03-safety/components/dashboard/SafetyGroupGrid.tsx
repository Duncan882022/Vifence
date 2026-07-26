import { TrendingDown, TrendingUp } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/utils/cn'
import type { SafetyGroupId, SafetyGroupStats } from '../../types/safety.types'
import { SAFETY_GROUP_MAP } from '../../data/safetyGroups'
import { getScenariosForGroup } from '../../data/safetyScenarios'
import { GROUP_BADGE, GROUP_BAR_COLORS, GROUP_COLORS, GROUP_ICONS } from '../../utils/safetyDashboardUi'

interface SafetyGroupGridProps {
  stats: SafetyGroupStats[]
  selectedGroupId?: SafetyGroupId | null
  onSelectGroup?: (groupId: SafetyGroupId | null) => void
}

function KpiCell({
  value,
  label,
  max,
  barClassName,
  valueClassName,
}: {
  value: number
  label: string
  max: number
  barClassName: string
  valueClassName?: string
}) {
  return (
    <div className="flex-1 min-w-0 text-center px-0.5 py-1 rounded bg-[#111827]/80 border border-[#1e2433]/60">
      <p className={cn('text-[11px] font-bold tabular-nums leading-none', valueClassName ?? 'text-foreground')}>
        {value}
      </p>
      <p className="text-[7px] text-muted-foreground leading-tight mt-0.5 truncate">{label}</p>
      <div className="mt-1 h-1 rounded-full bg-[#1e2433] overflow-hidden">
        <div
          className={cn('h-full rounded-full', barClassName)}
          style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }}
        />
      </div>
    </div>
  )
}

function GroupScenarioChart({ s }: { s: SafetyGroupStats }) {
  const catalog = getScenariosForGroup(s.groupId)
  const activeScenarioCount = s.scenarioBreakdown.filter(item => item.count > 0).length
  const maxScenario = Math.max(...s.scenarioBreakdown.map(item => item.count), 1)
  const barColor = GROUP_BAR_COLORS[s.groupId]

  return (
    <div className="flex-1 min-h-0 mt-1.5 flex flex-col overflow-hidden">
      <p className="text-[7px] font-bold uppercase tracking-wider text-muted-foreground/70 shrink-0 mb-0.5">
        Kịch bản · {activeScenarioCount}/{catalog.length}
      </p>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-0.5 pr-0.5 scrollbar-thin">
        {s.scenarioBreakdown.map(item => (
          <div key={item.scenarioId} className="flex items-center gap-1 min-w-0">
            <div className="w-[26%] shrink-0 h-1 rounded-full bg-[#1e2433] overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', item.count > 0 ? barColor : 'bg-[#1e2433]')}
                style={{ width: `${item.count > 0 ? (item.count / maxScenario) * 100 : 0}%` }}
              />
            </div>
            <span
              className={cn(
                'text-[7px] truncate flex-1 min-w-0 leading-snug',
                item.count > 0 ? 'text-muted-foreground' : 'text-muted-foreground/45',
              )}
              title={item.name}
            >
              {item.name}
            </span>
            <span className={cn(
              'text-[7px] font-semibold tabular-nums shrink-0 w-3 text-right',
              item.count > 0 ? 'text-foreground' : 'text-muted-foreground/40',
            )}>
              {item.count}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function GroupCard({
  s,
  selected,
  onSelect,
}: {
  s: SafetyGroupStats
  selected: boolean
  onSelect?: (groupId: SafetyGroupId | null) => void
}) {
  const group = SAFETY_GROUP_MAP.get(s.groupId)!
  const Icon = GROUP_ICONS[s.groupId]
  const severityMax = Math.max(s.critical, s.violation, s.warning, 1)

  return (
    <button
      type="button"
      onClick={() => onSelect?.(selected ? null : s.groupId)}
      title={group.description}
      className={cn(
        'flex flex-col h-full min-h-0 text-left border rounded-lg p-2 transition-colors overflow-hidden',
        'bg-[#0b0f1a] hover:border-[#2a3855]',
        selected ? 'border-primary ring-1 ring-primary/30' : 'border-[#1e2433]',
      )}
    >
      <div className="flex items-start gap-1.5 shrink-0 min-w-0">
        <Link
          to={`/module03/group/${s.groupId}`}
          onClick={e => e.stopPropagation()}
          title={`Xem chi tiết ${group.name}`}
          className={cn(
            'w-7 h-7 rounded-md flex items-center justify-center shrink-0 border transition-colors',
            'hover:brightness-125 hover:ring-1 hover:ring-primary/40',
            GROUP_BADGE[s.groupId],
          )}
        >
          <Icon className={cn('w-3.5 h-3.5', GROUP_COLORS[s.groupId])} aria-hidden />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground">{s.groupId}</span>
            <span className={cn(
              'inline-flex items-center gap-0.5 text-[7px] tabular-nums ml-auto shrink-0',
              s.trend > 0 ? 'text-red-400' : s.trend < 0 ? 'text-green-400' : 'text-muted-foreground/60',
            )}>
              {s.trend > 0 && <TrendingUp className="w-2.5 h-2.5" />}
              {s.trend < 0 && <TrendingDown className="w-2.5 h-2.5" />}
              {s.trend > 0 ? `+${s.trend}` : s.trend}
            </span>
          </div>
          <p className="text-[9px] font-semibold text-foreground leading-snug line-clamp-2 mt-0.5">{group.name}</p>
        </div>
      </div>

      <div className="flex gap-1 mt-auto pt-1.5 shrink-0">
        <KpiCell
          value={s.critical}
          label="Khẩn cấp"
          max={severityMax}
          valueClassName="text-red-400"
          barClassName="bg-red-400/80"
        />
        <KpiCell
          value={s.violation}
          label="Vi phạm"
          max={severityMax}
          valueClassName="text-orange-400"
          barClassName="bg-orange-400/80"
        />
        <KpiCell
          value={s.warning}
          label="Cảnh báo"
          max={severityMax}
          valueClassName="text-amber-400"
          barClassName="bg-amber-400/80"
        />
      </div>

      <GroupScenarioChart s={s} />
    </button>
  )
}

export function SafetyGroupGrid({ stats, selectedGroupId, onSelectGroup }: SafetyGroupGridProps) {
  return (
    <div className="h-full min-h-0 p-2 max-lg:h-auto max-lg:min-h-0 max-lg:overflow-visible lg:overflow-hidden">
      <div className="grid h-full min-h-0 max-lg:h-auto max-lg:grid-flow-row max-lg:auto-rows-min grid-cols-1 min-[480px]:max-lg:grid-cols-2 lg:grid-cols-3 lg:grid-rows-2 gap-2 lg:auto-rows-fr">
        {stats.map(s => (
          <GroupCard
            key={s.groupId}
            s={s}
            selected={selectedGroupId === s.groupId}
            onSelect={onSelectGroup}
          />
        ))}
      </div>
    </div>
  )
}
