import { TrendingDown, TrendingUp } from 'lucide-react'
import { TagTooltip } from '@/components/common/IconTooltip/IconTooltip'
import { cn } from '@/utils/cn'
import type { AlertSeverity, SafetyGroupStats } from '../../types/safety.types'
import { SAFETY_GROUP_MAP, getGroupDictionaryTooltip } from '../../data/safetyGroups'
import {
  GROUP_BADGE,
  GROUP_BORDER_ACCENT,
  GROUP_COLORS,
  GROUP_ICONS,
  getScenarioIcon,
  SEVERITY_BADGE,
  SEVERITY_ICONS,
  SEVERITY_LABELS_UI,
} from '../../utils/safetyDashboardUi'

interface SafetyGroupGridProps {
  stats: SafetyGroupStats[]
}

function GroupScenarioTable({ s }: { s: SafetyGroupStats }) {
  const rows = [...s.scenarioBreakdown].sort((a, b) => {
    if (a.count > 0 !== b.count > 0) return a.count > 0 ? -1 : 1
    return b.count - a.count
  })

  return (
    <div className="flex-1 min-h-0 mt-2 flex flex-col overflow-hidden rounded-md border border-[#1e2433]/80 bg-[#080c14]/60">
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-thin">
        {rows.map(item => {
          const ScenarioIcon = getScenarioIcon(item.scenarioId)
          const active = item.count > 0
          const severity = item.severity as AlertSeverity
          const SeverityIcon = SEVERITY_ICONS[severity]
          const countTip = active ? `${item.count} sự kiện` : 'Không có sự kiện'

          return (
            <div
              key={item.scenarioId}
              className="flex items-center gap-1 px-2 py-1.5 border-b border-[#1e2433]/50 last:border-b-0 min-w-0"
            >
              <TagTooltip content={item.name} multiline className="flex items-center gap-1.5 flex-1 min-w-0">
                {ScenarioIcon && (
                  <span
                    className={cn(
                      'w-5 h-5 rounded-full border flex items-center justify-center shrink-0',
                      active ? GROUP_BADGE[s.groupId] : 'border-[#1e2433]/60 bg-[#0b0f1a]/80',
                    )}
                  >
                    <ScenarioIcon
                      className={cn(
                        'w-2.5 h-2.5',
                        active ? GROUP_COLORS[s.groupId] : 'text-muted-foreground/35',
                      )}
                      aria-hidden
                    />
                  </span>
                )}
                <span
                  className={cn(
                    'text-[8px] leading-snug truncate',
                    active ? 'text-foreground/95' : 'text-muted-foreground/40',
                  )}
                >
                  {item.name}
                </span>
              </TagTooltip>

              <TagTooltip content={countTip} className="shrink-0">
                <span
                  className={cn(
                    'w-7 text-center text-[10px] font-bold tabular-nums',
                    active ? 'text-foreground' : 'text-muted-foreground/35',
                  )}
                >
                  {item.count}
                </span>
              </TagTooltip>

              <span className="w-px h-4 bg-[#1e2433]/90 shrink-0" aria-hidden />

              <TagTooltip content={SEVERITY_LABELS_UI[severity]} className="shrink-0 flex justify-end">
                {active ? (
                  <span
                    className={cn(
                      'w-5 h-5 rounded border inline-flex items-center justify-center',
                      SEVERITY_BADGE[severity],
                    )}
                    aria-label={SEVERITY_LABELS_UI[severity]}
                  >
                    <SeverityIcon className="w-2.5 h-2.5 shrink-0" aria-hidden />
                  </span>
                ) : (
                  <span className="text-[8px] text-muted-foreground/35 tabular-nums w-5 text-center">—</span>
                )}
              </TagTooltip>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function GroupCard({ s }: { s: SafetyGroupStats }) {
  const group = SAFETY_GROUP_MAP.get(s.groupId)!
  const Icon = GROUP_ICONS[s.groupId]
  const groupTip = getGroupDictionaryTooltip(s.groupId)
  const trendLabel = s.trend > 0 ? `Tăng ${s.trend} so với hôm qua` : s.trend < 0 ? `Giảm ${Math.abs(s.trend)} so với hôm qua` : 'Không đổi so với hôm qua'

  return (
    <div
      className={cn(
        'flex flex-col h-full min-h-0 text-left border border-l-2 rounded-lg p-2 overflow-hidden',
        'bg-[#0b0f1a] border-[#1e2433]',
        GROUP_BORDER_ACCENT[s.groupId],
      )}
    >
      <TagTooltip content={groupTip} multiline className="flex items-start gap-1.5 shrink-0 min-w-0 w-full">
        <div
          className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border',
            GROUP_BADGE[s.groupId],
          )}
        >
          <Icon className={cn('w-4 h-4', GROUP_COLORS[s.groupId])} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-bold text-foreground tracking-wide">
              {s.groupId}
            </span>
            <span className={cn(
              'text-[10px] font-bold tabular-nums',
              s.total > 0 ? 'text-foreground' : 'text-muted-foreground/40',
            )}>
              {s.total}
            </span>
            <TagTooltip content={trendLabel} className="ml-auto shrink-0">
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 text-[8px] font-semibold tabular-nums',
                  s.trend > 0 ? 'text-red-400' : s.trend < 0 ? 'text-green-400' : 'text-muted-foreground/60',
                )}
              >
                {s.trend > 0 && <TrendingUp className="w-3 h-3" aria-hidden />}
                {s.trend < 0 && <TrendingDown className="w-3 h-3" aria-hidden />}
                {s.trend > 0 ? `+${s.trend}` : s.trend}
              </span>
            </TagTooltip>
          </div>
          <p className="text-[8px] text-muted-foreground leading-snug truncate mt-0.5">
            {group.name}
          </p>
        </div>
      </TagTooltip>

      <GroupScenarioTable s={s} />
    </div>
  )
}

export function SafetyGroupGrid({ stats }: SafetyGroupGridProps) {
  return (
    <div className="h-full min-h-0 p-2 max-lg:h-auto max-lg:min-h-0 max-lg:overflow-visible lg:overflow-hidden">
      <div className="grid h-full min-h-0 max-lg:h-auto max-lg:grid-flow-row max-lg:auto-rows-min grid-cols-1 min-[480px]:max-lg:grid-cols-2 lg:grid-cols-3 lg:grid-rows-2 gap-2 lg:auto-rows-fr">
        {stats.map(s => (
          <GroupCard key={s.groupId} s={s} />
        ))}
      </div>
    </div>
  )
}
