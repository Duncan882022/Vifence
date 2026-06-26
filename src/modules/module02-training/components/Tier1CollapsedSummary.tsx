import { IconTooltip } from '@/components/common/IconTooltip/IconTooltip'
import type { TrainingDailySummary } from '../services/trainingKpi.service'
import { TRAINING_METRIC_META } from '../data/trainingMetricMeta'

interface Tier1CollapsedSummaryProps {
  summary: TrainingDailySummary
}

export function Tier1CollapsedSummary({ summary }: Tier1CollapsedSummaryProps) {
  return (
    <div className="flex items-center gap-3 text-[10px] tabular-nums overflow-x-auto scrollbar-none min-w-0">
      {summary.metrics.map((metric, i) => {
        const meta = TRAINING_METRIC_META[i]
        if (!meta) return null
        return (
          <span key={metric.label} className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0">
            <IconTooltip
              icon={meta.icon}
              label={meta.tip}
              iconClassName={meta.iconColor}
              size="sm"
            />
            <span className="font-semibold text-foreground">
              {metric.value}{metric.unit ?? ''}
            </span>
          </span>
        )
      })}
    </div>
  )
}
