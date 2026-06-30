import { IconTooltip } from '@/components/common/IconTooltip/IconTooltip'
import type { SafetyDailySummary } from '../services/safetyKpi.service'
import { SAFETY_METRIC_META } from '../data/safetyMetricMeta'
import { formatPpeScore } from '../utils/safetyUiHelpers'
import { PpeComplianceTooltip, PpeLevelIcon } from './PpeComplianceTooltip'
import { ViolationTypeChips } from './ViolationTypeChips'

interface SafetyTier1CollapsedSummaryProps {
  summary: SafetyDailySummary
}

export function SafetyTier1CollapsedSummary({ summary }: SafetyTier1CollapsedSummaryProps) {
  return (
    <div className="flex items-center gap-2 sm:gap-3 text-[9px] sm:text-[10px] tabular-nums overflow-x-auto scrollbar-none min-w-0 max-w-[calc(100vw-8rem)] sm:max-w-none">
      {summary.metrics.map((metric, i) => {
        const meta = SAFETY_METRIC_META[i]
        if (!meta) return null
        const isPpe = i === 0
        const score = Number(metric.value)

        const isPenalties = i === 3
        const isViolations = i === 1

        return (
          <span key={metric.label} className="inline-flex items-center gap-1.5 whitespace-nowrap shrink-0">
            {isPpe ? (
              <>
                <PpeLevelIcon score={score} size="xs" />
                <PpeComplianceTooltip score={score} iconClassName="w-2.5 h-2.5" />
              </>
            ) : (
              <IconTooltip
                icon={meta.icon}
                label={meta.tip}
                iconClassName={meta.iconColor}
                size="sm"
              />
            )}
            <span className="font-semibold text-foreground">
              {isPpe
                ? formatPpeScore(score)
                : isPenalties
                  ? `${summary.today.penaltiesResolved}/${summary.today.penaltiesPending}`
                  : metric.value}
              {!isPpe && !isPenalties && metric.unit ? ` ${metric.unit}` : ''}
            </span>
            {isViolations && (
              <ViolationTypeChips stats={summary.today} />
            )}
          </span>
        )
      })}
    </div>
  )
}
