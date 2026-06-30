import { cn } from '@/utils/cn'
import type { ViolationType } from '@/types/safety'
import type { SafetyDayStats } from '../services/safetyKpi.service'
import { VIOLATION_TYPE_LABELS } from '../data/safetyViolations'
import { ViolationTypeIcon } from './ViolationTypeIcon'

interface ViolationTypeChipsProps {
  stats: Pick<SafetyDayStats, 'violationsByType'>
  size?: 'xs' | 'sm'
  className?: string
}

export function ViolationTypeChips({ stats, size = 'sm', className }: ViolationTypeChipsProps) {
  const chips = (Object.entries(stats.violationsByType) as [ViolationType, number][])
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])

  if (chips.length === 0) {
    return (
      <p className={cn('text-[9px] text-muted-foreground/60 leading-snug', className)}>
        Không có vi phạm
      </p>
    )
  }

  const iconSize = size === 'xs' ? 'xs' : 'sm'
  const countClass = size === 'xs' ? 'text-[8px]' : 'text-[9px]'

  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {chips.map(([type, count]) => (
        <span
          key={type}
          className={cn(
            'inline-flex items-center gap-0.5 rounded px-1 py-0.5',
            'bg-[#1a2235]/60 border border-[#1e2433]/80',
            countClass,
            'font-semibold tabular-nums',
          )}
          title={`${VIOLATION_TYPE_LABELS[type]} · ${count}`}
        >
          <ViolationTypeIcon type={type} size={iconSize} />
          <span className="text-foreground">{count}</span>
        </span>
      ))}
    </div>
  )
}
