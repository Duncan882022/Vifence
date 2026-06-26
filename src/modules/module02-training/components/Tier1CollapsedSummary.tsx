import { cn } from '@/utils/cn'
import type { TrainingDailySummary } from '../services/trainingKpi.service'

interface Tier1CollapsedSummaryProps {
  summary: TrainingDailySummary
}

export function Tier1CollapsedSummary({ summary }: Tier1CollapsedSummaryProps) {
  return (
    <div className={cn(
      'flex items-center gap-3 text-[10px] tabular-nums min-w-0',
      'max-lg:overflow-x-auto max-lg:scrollbar-none',
    )}>
      {summary.metrics.map(metric => (
        <span
          key={metric.label}
          className="whitespace-nowrap shrink-0 font-semibold text-foreground"
        >
          {metric.value}{metric.unit ?? ''}
        </span>
      ))}
    </div>
  )
}
