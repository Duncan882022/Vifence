import { cn } from '@/utils/cn'
import type { TrainingDailySummary } from '../services/trainingKpi.service'

interface Tier1CollapsedSummaryProps {
  summary: TrainingDailySummary
}

function collapsedHint(index: number, summary: TrainingDailySummary): string | null {
  const { today } = summary
  switch (index) {
    case 0: {
      const parts: string[] = []
      if (today.coursesLive > 0) parts.push(`${today.coursesLive} đang`)
      else if (today.coursesActive > 0) parts.push(`${today.coursesActive} đang`)
      if (today.coursesUpcoming > 0) parts.push(`${today.coursesUpcoming} sắp`)
      return parts.length > 0 ? parts.join(' · ') : null
    }
    case 1:
      return today.enrolledStarted > 0
        ? `${today.recorded}/${today.enrolledStarted}`
        : null
    case 2:
      return today.enrolledStarted > 0
        ? `${Math.round((today.exceptions / today.enrolledStarted) * 1000) / 10}%`
        : null
    case 3:
      return today.enrolledStarted > 0
        ? `${today.recorded}/${today.enrolledStarted}`
        : null
    default:
      return null
  }
}

export function Tier1CollapsedSummary({ summary }: Tier1CollapsedSummaryProps) {
  return (
    <div className={cn(
      'flex items-center gap-2 sm:gap-3 text-[10px] text-muted-foreground tabular-nums min-w-0',
      'max-lg:landscape:flex-wrap max-lg:landscape:gap-x-2 max-lg:landscape:gap-y-0.5 max-lg:landscape:justify-end',
      'max-lg:portrait:overflow-x-auto max-lg:portrait:scrollbar-none',
    )}>
      {summary.metrics.map((metric, i) => {
        const hint = collapsedHint(i, summary)
        return (
          <span key={metric.label} className="whitespace-nowrap shrink-0 max-lg:landscape:text-[9px]">
            <span className="font-semibold text-foreground">{metric.value}{metric.unit ?? ''}</span>
            {hint && (
              <span className="text-muted-foreground/70 ml-0.5 max-lg:landscape:hidden">({hint})</span>
            )}
            <span className="text-muted-foreground/55 ml-1 hidden lg:inline">{metric.label}</span>
          </span>
        )
      })}
    </div>
  )
}
