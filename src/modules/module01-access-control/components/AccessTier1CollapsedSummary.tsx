import { IconTooltip } from '@/components/common/IconTooltip/IconTooltip'
import type { AccessDailySummary } from '../services/accessKpi.service'
import { ACCESS_METRIC_META } from '../data/accessMetricMeta'

interface AccessTier1CollapsedSummaryProps {
  summary: AccessDailySummary
}

export function AccessTier1CollapsedSummary({ summary }: AccessTier1CollapsedSummaryProps) {
  return (
    <div className="flex items-center gap-2 sm:gap-3 text-[9px] sm:text-[10px] tabular-nums overflow-x-auto scrollbar-none min-w-0 max-w-[calc(100vw-8rem)] sm:max-w-none">
      {summary.metrics.map((metric, i) => {
        const meta = ACCESS_METRIC_META[i]
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
