import {
  TrendingUp, TrendingDown, Minus,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { IconTooltip } from '@/components/common/IconTooltip/IconTooltip'
import type { KPIData } from '@/types/api'
import type { SafetyDailySummary } from '../services/safetyKpi.service'
import { SAFETY_METRIC_META } from '../data/safetyMetricMeta'

type MetricIndex = 0 | 1 | 2 | 3

function formatPercentDelta(change: number): string {
  const prefix = change > 0 ? '+' : ''
  return `${prefix}${change}%`
}

interface DailyMetricCardProps {
  data: KPIData
  meta: typeof SAFETY_METRIC_META[number]
  embedded?: boolean
}

function DailyMetricCard({ data, meta, embedded }: DailyMetricCardProps) {
  const { icon: Icon, iconColor, iconBg, accent, tip } = meta
  const {
    value, change, changeType,
    previousValue, higherIsBetter = true,
  } = data

  const isUp = changeType === 'increase'
  const isDown = changeType === 'decrease'
  const isNeutral = changeType === 'neutral'
  const isGood = higherIsBetter ? isUp : isDown
  const isBad = higherIsBetter ? isDown : isUp
  const showCompare = change !== undefined && changeType !== undefined

  return (
    <div className={cn(
      'border border-[#1e2433] border-l-2 rounded-lg flex flex-col gap-1.5 sm:gap-2',
      'min-h-[84px] sm:min-h-[96px]',
      'hover:border-[#2a3855]/80 transition-colors',
      'p-2.5 sm:p-3',
      embedded ? 'bg-[#0b0f1a]' : 'bg-[#0d1117]',
      accent,
    )}>
      <div className="flex items-center gap-2.5 min-w-0">
        <div className={cn(
          'w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center shrink-0 self-center',
          iconBg,
        )}>
          <IconTooltip icon={Icon} label={tip} iconClassName={iconColor} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[9px] sm:text-[10px] font-medium text-muted-foreground truncate leading-tight">{data.label}</p>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className="font-bold text-foreground leading-none tabular-nums tracking-tight text-xl sm:text-2xl">
              {value}
            </span>
          </div>
        </div>
      </div>

      {showCompare && (
        <div
          className="flex items-center justify-between gap-2 pt-2 border-t border-[#1e2433]/70 mt-auto"
          title={`Kỳ trước: ${previousValue}`}
        >
          <span className="text-[10px] text-muted-foreground whitespace-nowrap truncate min-w-0 tabular-nums">
            <span className="font-semibold text-muted-foreground/90">
              {previousValue}
            </span>
            <span className="text-muted-foreground/50 ml-1">kỳ trước</span>
          </span>
          <span className={cn(
            'inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums shrink-0',
            isGood && 'text-green-400',
            isBad && 'text-red-400',
            isNeutral && 'text-muted-foreground',
          )}>
            {isUp && <TrendingUp className="w-3 h-3" />}
            {isDown && <TrendingDown className="w-3 h-3" />}
            {isNeutral && <Minus className="w-3 h-3" />}
            {isNeutral ? '—' : formatPercentDelta(change!)}
          </span>
        </div>
      )}
    </div>
  )
}

interface SafetyDailyDashboardProps {
  summary: SafetyDailySummary
  embedded?: boolean
}

export function SafetyDailyDashboard({ summary, embedded }: SafetyDailyDashboardProps) {
  const { metrics } = summary

  return (
    <div className="grid grid-cols-1 min-[400px]:grid-cols-2 xl:grid-cols-4 gap-2.5 sm:gap-3">
      {metrics.map((metric, i) => (
        <DailyMetricCard
          key={metric.label}
          data={metric}
          meta={SAFETY_METRIC_META[i as MetricIndex]}
          embedded={embedded}
        />
      ))}
    </div>
  )
}
