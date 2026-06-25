import {
  BookOpen, Users, AlertTriangle, ShieldCheck,
  TrendingUp, TrendingDown, Minus,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import type { KPIData } from '@/types/api'
import type { TrainingDailySummary } from '../services/trainingKpi.service'

const METRIC_META = [
  { icon: BookOpen,      iconColor: 'text-green-400',  iconBg: 'bg-green-500/10',  accent: 'border-l-green-500/50' },
  { icon: Users,         iconColor: 'text-sky-400',    iconBg: 'bg-sky-500/10',    accent: 'border-l-sky-500/50'    },
  { icon: AlertTriangle, iconColor: 'text-orange-400', iconBg: 'bg-orange-500/10', accent: 'border-l-orange-500/50' },
  { icon: ShieldCheck,   iconColor: 'text-blue-400',   iconBg: 'bg-blue-500/10',   accent: 'border-l-blue-500/50'   },
] as const

function formatDelta(change: number, changeUnit?: string): string {
  const prefix = change > 0 ? '+' : ''
  const suffix = changeUnit ? ` ${changeUnit}` : ''
  return `${prefix}${change}${suffix}`
}

interface DailyMetricCardProps {
  data: KPIData
  meta: typeof METRIC_META[number]
  embedded?: boolean
}

function DailyMetricCard({ data, meta, embedded }: DailyMetricCardProps) {
  const { icon: Icon, iconColor, iconBg, accent } = meta
  const {
    label, value, unit, detail, change, changeType,
    higherIsBetter = true, changeUnit,
  } = data

  const isUp = changeType === 'increase'
  const isDown = changeType === 'decrease'
  const isNeutral = changeType === 'neutral'
  const isGood = higherIsBetter ? isUp : isDown
  const isBad = higherIsBetter ? isDown : isUp
  const showCompare = change !== undefined && changeType !== undefined

  return (
    <div className={cn(
      'border border-[#1e2433] border-l-2 rounded-lg',
      'hover:border-[#2a3855]/80 transition-colors',
      'p-3 lg:py-2 lg:px-3',
      embedded ? 'bg-[#0b0f1a]' : 'bg-[#0d1117]',
      accent,
    )}>
      <div className="flex items-start gap-2.5 lg:items-center lg:gap-2">
        <div className={cn('w-9 h-9 lg:w-7 lg:h-7 rounded-lg flex items-center justify-center shrink-0', iconBg)}>
          <Icon className={cn('w-4 h-4 lg:w-3.5 lg:h-3.5', iconColor)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide leading-tight">
            {label}
          </p>
          <div className="flex items-baseline gap-1 mt-1 lg:mt-0">
            <span className="text-[26px] lg:text-[22px] font-bold text-foreground leading-none tabular-nums tracking-tight">
              {value}
            </span>
            {unit && (
              <span className="text-[11px] lg:text-[10px] font-medium text-muted-foreground">{unit}</span>
            )}
          </div>
          {detail && (
            <p className="text-[10px] text-muted-foreground/75 mt-1 lg:hidden leading-snug line-clamp-2">
              {detail}
            </p>
          )}
          {showCompare && (
            <div className={cn(
              'flex items-center gap-1 text-[10px] font-medium mt-0.5 lg:mt-0 lg:text-[9px]',
              isGood && 'text-green-400',
              isBad && 'text-red-400',
              isNeutral && 'text-muted-foreground',
            )}>
              {isUp && <TrendingUp className="w-3 h-3 shrink-0" />}
              {isDown && <TrendingDown className="w-3 h-3 shrink-0" />}
              {isNeutral && <Minus className="w-3 h-3 shrink-0" />}
              <span className="truncate">
                {isNeutral
                  ? 'Không đổi so với hôm qua'
                  : `${formatDelta(change!, changeUnit)} so với hôm qua`}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface TrainingDailyDashboardProps {
  summary: TrainingDailySummary
  /** KPI nằm trong Panel — tách nền card khỏi nền panel */
  embedded?: boolean
}

export function TrainingDailyDashboard({ summary, embedded }: TrainingDailyDashboardProps) {
  const { metrics } = summary

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      {metrics.map((metric, i) => (
        <DailyMetricCard key={metric.label} data={metric} meta={METRIC_META[i]} embedded={embedded} />
      ))}
    </div>
  )
}
