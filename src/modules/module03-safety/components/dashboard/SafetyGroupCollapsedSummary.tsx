import { cn } from '@/utils/cn'
import type { SafetyGroupStats } from '../../types/safety.types'

interface SafetyGroupCollapsedSummaryProps {
  groupStats: SafetyGroupStats[]
  className?: string
}

/** Tóm tắt thu gọn — cùng pattern header Camera ("X luồng") */
export function SafetyGroupCollapsedSummary({ groupStats, className }: SafetyGroupCollapsedSummaryProps) {
  const total = groupStats.reduce((sum, g) => sum + g.total, 0)

  return (
    <span className={cn('text-[10px] text-muted-foreground tabular-nums whitespace-nowrap', className)}>
      <span className="text-primary font-semibold">{total}</span>
      {' vi phạm'}
    </span>
  )
}
