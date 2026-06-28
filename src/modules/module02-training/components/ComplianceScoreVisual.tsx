import { MetricPercentRing } from '@/components/common/MetricPercentRing/MetricPercentRing'
import { cn } from '@/utils/cn'
import { percentToHeatColor } from '../services/trainingKpi.service'

interface ComplianceScoreVisualProps {
  score: number
  size?: number
  className?: string
}

/** Ring gauge % tuân thủ — khớp MetricPercentRing của các KPI khác */
export function ComplianceScoreVisual({ score, size = 46, className }: ComplianceScoreVisualProps) {
  const display = Number.isInteger(score) ? String(score) : score.toFixed(1)

  return (
    <MetricPercentRing
      percent={score}
      color={percentToHeatColor(score)}
      size={size}
      className={cn('mt-0.5', className)}
      title={`${display}% tuân thủ`}
    />
  )
}
