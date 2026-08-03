import { TagTooltip } from '@/components/common/IconTooltip/IconTooltip'
import { cn } from '@/utils/cn'
import type { HousekeepingAiGroupId, HousekeepingGroupStats } from '../../types/housekeepingAi.types'
import { HOUSEKEEPING_GROUP_MAP, getHousekeepingGroupTooltip } from '../../data/housekeepingGroups'
import {
  GROUP_BADGE,
  GROUP_BORDER_ACCENT,
  GROUP_COLORS,
  GROUP_ICONS,
  SEVERITY_BADGE,
  SEVERITY_ICONS,
  SEVERITY_LABELS,
  getScenarioIcon,
} from '../../services/housekeepingDashboard.service'

interface HousekeepingGroupGridProps {
  stats: HousekeepingGroupStats[]
  selectedGroupId?: HousekeepingAiGroupId | null
  onSelectGroup?: (groupId: HousekeepingAiGroupId | null) => void
}

function GroupCard({
  s,
  selected,
  onSelect,
}: {
  s: HousekeepingGroupStats
  selected: boolean
  onSelect?: () => void
}) {
  const group = HOUSEKEEPING_GROUP_MAP.get(s.groupId)!
  const Icon = GROUP_ICONS[s.groupId]
  const tip = getHousekeepingGroupTooltip(s.groupId)

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'flex flex-col h-full min-h-[180px] text-left border border-l-2 rounded-lg p-2 overflow-hidden transition-colors',
        'bg-[#0b0f1a] border-[#1e2433] hover:border-[#2a3855]',
        GROUP_BORDER_ACCENT[s.groupId],
        selected && 'ring-1 ring-sky-500/40 border-sky-500/30',
      )}
    >
      <TagTooltip content={tip} multiline className="flex items-start gap-1.5 shrink-0 min-w-0 w-full">
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border', GROUP_BADGE[s.groupId])}>
          <Icon className={cn('w-4 h-4', GROUP_COLORS[s.groupId])} aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold text-foreground truncate">{group.name}</p>
          <p className="text-[8px] text-muted-foreground line-clamp-2 leading-snug mt-0.5">{group.description}</p>
        </div>
      </TagTooltip>

      <div className="flex items-center gap-3 mt-2 shrink-0">
        <span className="text-[18px] font-bold tabular-nums text-foreground">{s.total}</span>
        <span className="text-[8px] text-muted-foreground">
          {s.unhandled} chưa xử lý
        </span>
      </div>

      <div className="flex-1 min-h-0 mt-2 flex flex-col overflow-hidden rounded-md border border-[#1e2433]/80 bg-[#080c14]/60">
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-thin">
          {s.scenarioBreakdown.map(item => {
            const ScenarioIcon = getScenarioIcon(item.scenarioId)
            const active = item.count > 0
            const SevIcon = SEVERITY_ICONS[item.severity]
            return (
              <div
                key={item.scenarioId}
                className="flex items-center gap-1 px-2 py-1.5 border-b border-[#1e2433]/50 last:border-b-0 min-w-0"
              >
                <TagTooltip content={item.name} multiline className="flex items-center gap-1.5 flex-1 min-w-0">
                  {ScenarioIcon && (
                    <span className={cn(
                      'w-5 h-5 rounded-full border flex items-center justify-center shrink-0',
                      active ? GROUP_BADGE[s.groupId] : 'border-[#1e2433]/60 bg-[#0b0f1a]/80',
                    )}>
                      <ScenarioIcon className={cn('w-2.5 h-2.5', active ? GROUP_COLORS[s.groupId] : 'text-muted-foreground/35')} />
                    </span>
                  )}
                  <span className={cn('text-[8px] leading-snug truncate', active ? 'text-foreground/95' : 'text-muted-foreground/40')}>
                    {item.scenarioId} · {item.name}
                  </span>
                </TagTooltip>
                <span className={cn('w-7 text-center text-[10px] font-bold tabular-nums', active ? 'text-foreground' : 'text-muted-foreground/35')}>
                  {item.count}
                </span>
                <span className={cn(
                  'text-[7px] px-1 py-0.5 rounded border inline-flex items-center gap-0.5 shrink-0',
                  active ? SEVERITY_BADGE[item.severity] : 'bg-[#1a2235]/30 text-muted-foreground/35 border-[#1e2433]/50',
                )}>
                  <SevIcon className="w-2.5 h-2.5" aria-hidden />
                  {SEVERITY_LABELS[item.severity]}
                </span>
              </div>
            )
          })}
        </div>
      </div>
    </button>
  )
}

export function HousekeepingGroupGrid({ stats, selectedGroupId, onSelectGroup }: HousekeepingGroupGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 h-full min-h-0">
      {stats.map(s => (
        <GroupCard
          key={s.groupId}
          s={s}
          selected={selectedGroupId === s.groupId}
          onSelect={() => onSelectGroup?.(selectedGroupId === s.groupId ? null : s.groupId)}
        />
      ))}
    </div>
  )
}
