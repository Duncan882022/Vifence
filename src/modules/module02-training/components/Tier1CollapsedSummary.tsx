import { cn } from '@/utils/cn'
import { IconTooltip } from '@/components/common/IconTooltip/IconTooltip'
import type { TrainingDailySummary } from '../services/trainingKpi.service'
import { TRAINING_METRIC_META } from '../data/trainingMetricMeta'

interface Tier1CollapsedSummaryProps {
  summary: TrainingDailySummary
  className?: string
}

export function Tier1CollapsedSummary({ summary, className }: Tier1CollapsedSummaryProps) {
  return (
    <div className={cn(
      'flex flex-wrap items-center justify-end gap-1 lg:gap-1.5 tabular-nums leading-tight min-w-0',
      className,
    )}>
      {summary.metrics.map((metric, i) => {
        const meta = TRAINING_METRIC_META[i]
        if (!meta) return null

        const display = metric.unit === '%'
          ? `${metric.value}%`
          : metric.unit
            ? `${metric.value} ${metric.unit}`
            : String(metric.value)

        const compact = metric.unit === '%'
          ? `${metric.value}%`
          : String(metric.value)

        return (
          <span
            key={metric.label}
            className="inline-flex items-center gap-0.5 lg:gap-1 min-w-0"
          >
            <span className={cn(
              'w-5 h-5 rounded-md flex items-center justify-center shrink-0',
              meta.iconBg,
            )}>
              <IconTooltip
                icon={meta.icon}
                label={metric.label}
                tip={`${metric.label}: ${display} — ${meta.tip}`}
                iconClassName={meta.iconColor}
                size="xs"
              />
            </span>
            <span
              className="text-[8px] lg:text-[9px] font-medium text-muted-foreground truncate"
              title={`${metric.label}: ${display}`}
            >
              <span className="sm:hidden">{compact}</span>
              <span className="hidden sm:inline">{display}</span>
            </span>
          </span>
        )
      })}
    </div>
  )
}
