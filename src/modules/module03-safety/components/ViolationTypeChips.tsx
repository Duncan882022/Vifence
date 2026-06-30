import { cn } from '@/utils/cn'
import type { ViolationType } from '@/types/safety'
import type { SafetyDayStats } from '../services/safetyKpi.service'
import { VIOLATION_TYPE_LABELS } from '../data/safetyViolations'
import { getViolationTypeIconConfig } from '../utils/safetyUiHelpers'

/** Shared chip shell — matches Camera `IconTooltipBadge` (no border, compact) */
export const DASHBOARD_CHIP_CLASS =
  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-semibold tabular-nums'

export const DASHBOARD_CHIP_ICON_CLASS = 'w-3 h-3 shrink-0 opacity-90'

interface ViolationTypeChipsProps {
  stats: Pick<SafetyDayStats, 'violationsByType'>
  className?: string
}

export function ViolationTypeChips({ stats, className }: ViolationTypeChipsProps) {
  const chips = (Object.entries(stats.violationsByType) as [ViolationType, number][])
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])

  const chipTotal = chips.reduce((sum, [, count]) => sum + count, 0)

  if (chips.length === 0) {
    return (
      <p className={cn('text-[9px] text-muted-foreground/60 leading-snug', className)}>
        Không có vi phạm
      </p>
    )
  }

  return (
    <div
      className={cn('flex flex-wrap gap-1 min-w-0 overflow-hidden', className)}
      title={`Tổng ${chipTotal} vi phạm · ${chips.length} loại`}
      aria-label={`${chipTotal} vi phạm, ${chips.length} loại`}
    >
      {chips.map(([type, count]) => {
        const { icon: Icon, color, bg } = getViolationTypeIconConfig(type)
        return (
          <span
            key={type}
            className={cn(DASHBOARD_CHIP_CLASS, bg, color)}
            title={`${VIOLATION_TYPE_LABELS[type]} · ${count}`}
          >
            <Icon className={DASHBOARD_CHIP_ICON_CLASS} aria-hidden />
            <span>{count}</span>
          </span>
        )
      })}
    </div>
  )
}
