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
}

function DailyMetricCard({ data, meta }: DailyMetricCardProps) {
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
      'bg-[#0d1117] border border-[#1e2433] border-l-2 rounded-lg p-3.5',
      'hover:border-[#2a3855]/80 transition-colors',
      accent,
    )}>
      <div className="flex items-start gap-2.5">
        <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center shrink-0', iconBg)}>
          <Icon className={cn('w-4 h-4', iconColor)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide leading-tight">
            {label}
          </p>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-[26px] font-bold text-foreground leading-none tabular-nums tracking-tight">
              {value}
            </span>
            {unit && (
              <span className="text-[11px] font-medium text-muted-foreground">{unit}</span>
            )}
          </div>
          {detail && (
            <p className="text-[10px] text-muted-foreground/75 mt-1 leading-snug line-clamp-2">
              {detail}
            </p>
          )}
          {showCompare && (
            <div className={cn(
              'flex items-center gap-1 text-[10px] font-medium mt-0.5',
              isGood && 'text-green-400',
              isBad && 'text-red-400',
              isNeutral && 'text-muted-foreground',
            )}>
              {isUp && <TrendingUp className="w-3 h-3 shrink-0" />}
              {isDown && <TrendingDown className="w-3 h-3 shrink-0" />}
              {isNeutral && <Minus className="w-3 h-3 shrink-0" />}
              <span>
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
}

export function TrainingDailyDashboard({ summary }: TrainingDailyDashboardProps) {
  const { metrics } = summary

  return (
    <div className="shrink-0 grid grid-cols-4 gap-3">
      {metrics.map((metric, i) => (
        <DailyMetricCard key={metric.label} data={metric} meta={METRIC_META[i]} />
      ))}
    </div>
  )
}
