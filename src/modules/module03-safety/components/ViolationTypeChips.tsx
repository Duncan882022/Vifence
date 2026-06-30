import { cn } from '@/utils/cn'
import type { ViolationType } from '@/types/safety'
import type { SafetyDayStats } from '../services/safetyKpi.service'
import { VIOLATION_TYPE_LABELS } from '../data/safetyViolations'
import { getViolationTypeIconConfig } from '../utils/safetyUiHelpers'

/** Shared chip shell — matches PPE severity + penalty chips on dashboard */
export const DASHBOARD_CHIP_CLASS =
  'inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[9px] font-medium tabular-nums'

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
        const { icon: Icon, color, bg, border } = getViolationTypeIconConfig(type)
        return (
          <span
            key={type}
            className={cn(DASHBOARD_CHIP_CLASS, bg, border, color)}
            title={`${VIOLATION_TYPE_LABELS[type]} · ${count}`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden />
            <span>{count}</span>
          </span>
        )
      })}
    </div>
  )
}
