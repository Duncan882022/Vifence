import { IconTooltip } from '@/components/common/IconTooltip/IconTooltip'
import type { HousekeepingDailySummary } from '../services/housekeepingKpi.service'
import { HOUSEKEEPING_METRIC_META } from '../data/housekeepingMetricMeta'

interface HousekeepingTier1CollapsedSummaryProps {
  summary: HousekeepingDailySummary
}

export function HousekeepingTier1CollapsedSummary({ summary }: HousekeepingTier1CollapsedSummaryProps) {
  return (
    <div className="flex items-center gap-2 sm:gap-3 text-[9px] sm:text-[10px] tabular-nums overflow-x-auto scrollbar-none min-w-0 max-w-[calc(100vw-8rem)] sm:max-w-none">
      {summary.metrics.map((metric, i) => {
        const meta = HOUSEKEEPING_METRIC_META[i]
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
