import { cn } from '@/utils/cn'
import type { TrainingDailySummary } from '../services/trainingKpi.service'

interface Tier1CollapsedSummaryProps {
  summary: TrainingDailySummary
}

export function Tier1CollapsedSummary({ summary }: Tier1CollapsedSummaryProps) {
  return (
    <div className={cn(
      'flex items-center gap-2 sm:gap-3 text-[10px] tabular-nums min-w-0',
      'max-lg:landscape:flex-wrap max-lg:landscape:gap-x-2 max-lg:landscape:justify-end',
      'max-lg:portrait:overflow-x-auto max-lg:portrait:scrollbar-none',
    )}>
      {summary.metrics.map(metric => (
        <span
          key={metric.label}
          className="whitespace-nowrap shrink-0 font-semibold text-foreground max-lg:landscape:text-[9px]"
        >
          {metric.value}{metric.unit ?? ''}
        </span>
      ))}
    </div>
  )
}
