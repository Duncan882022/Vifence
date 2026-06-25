import {
  BookOpen, Users, AlertTriangle, ShieldCheck,
  TrendingUp, TrendingDown, Minus,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import type { KPIData } from '@/types/api'
import type { TrainingDailySummary, TrainingDayStats } from '../services/trainingKpi.service'

const METRIC_META = [
  { icon: BookOpen,      iconColor: 'text-green-400',  iconBg: 'bg-green-500/10',  accent: 'border-l-green-500/50' },
  { icon: Users,         iconColor: 'text-sky-400',    iconBg: 'bg-sky-500/10',    accent: 'border-l-sky-500/50'    },
  { icon: AlertTriangle, iconColor: 'text-orange-400', iconBg: 'bg-orange-500/10', accent: 'border-l-orange-500/50' },
  { icon: ShieldCheck,   iconColor: 'text-blue-400',   iconBg: 'bg-blue-500/10',   accent: 'border-l-blue-500/50'   },
] as const

type MetricIndex = 0 | 1 | 2 | 3

function formatDelta(change: number, changeUnit?: string): string {
  const prefix = change > 0 ? '+' : ''
  const suffix = changeUnit ? ` ${changeUnit}` : ''
  return `${prefix}${change}${suffix}`
}

function StatChip({
  value,
  label,
  className,
  pulse,
}: {
  value: number
  label: string
  className: string
  pulse?: boolean
}) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-semibold tabular-nums',
      className,
    )}>
      {pulse && (
        <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-current shrink-0" />
      )}
      <span>{value}</span>
      <span className="font-medium opacity-80">{label}</span>
    </span>
  )
}

function CourseBreakdownChips({ stats }: { stats: TrainingDayStats }) {
  const chips = [
    {
      value: stats.coursesUpcoming,
      label: 'sắp',
      className: 'bg-sky-500/10 text-sky-400',
    },
    {
      value: stats.coursesLive > 0 ? stats.coursesLive : stats.coursesActive,
      label: 'đang',
      className: 'bg-green-500/10 text-green-400',
      pulse: stats.coursesLive > 0,
    },
    {
      value: stats.coursesCancelled,
      label: 'huỷ',
      className: 'bg-red-500/10 text-red-400',
    },
    {
      value: stats.coursesCompleted,
      label: 'xong',
      className: 'bg-gray-500/10 text-gray-400',
    },
  ]

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {chips.map(chip => (
        <StatChip
          key={chip.label}
          value={chip.value}
          label={chip.label}
          className={chip.className}
          pulse={chip.pulse}
        />
      ))}
    </div>
  )
}

function AttendeeInsight({ stats }: { stats: TrainingDayStats }) {
  if (stats.enrolledStarted === 0) {
    return (
      <p className="text-[10px] text-muted-foreground/75 mt-1 leading-snug">
        Chưa có ca nào bắt đầu
      </p>
    )
  }

  const coverage = Math.round((stats.recorded / stats.enrolledStarted) * 1000) / 10

  return (
    <div className="mt-1 space-y-0.5">
      <p className="text-[10px] font-semibold text-sky-400 tabular-nums leading-snug">
        {stats.recorded}/{stats.enrolledStarted} ca đã chạy
        <span className="text-muted-foreground/60 font-medium ml-1">({coverage}%)</span>
      </p>
      {stats.studyingNow > 0 && (
        <p className="text-[9px] text-muted-foreground/70 leading-snug">
          <span className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-sky-400 shrink-0" />
            <span className="font-semibold text-sky-400 tabular-nums">{stats.studyingNow}</span>
            {' '}đang học
          </span>
        </p>
      )}
    </div>
  )
}

function ExceptionInsight({ stats }: { stats: TrainingDayStats }) {
  if (stats.enrolledStarted === 0) {
    return (
      <p className="text-[10px] text-muted-foreground/75 mt-1 leading-snug">
        Chưa có ca nào bắt đầu
      </p>
    )
  }

  const rate = Math.round((stats.exceptions / stats.enrolledStarted) * 1000) / 10

  return (
    <div className="mt-1 space-y-0.5">
      <p className="text-[10px] font-semibold text-orange-400 tabular-nums leading-snug">
        {rate}% trên ca đã chạy
      </p>
      <p className="text-[9px] text-muted-foreground/70 leading-snug">
        {stats.exceptions}/{stats.enrolledStarted} học viên
      </p>
    </div>
  )
}

function ComplianceInsight({ stats }: { stats: TrainingDayStats }) {
  if (stats.enrolledStarted === 0) {
    return (
      <p className="text-[10px] text-muted-foreground/75 mt-1 leading-snug">
        Chưa có ca nào bắt đầu
      </p>
    )
  }

  return (
    <p className="text-[10px] font-semibold text-blue-400/90 tabular-nums mt-1 leading-snug">
      {stats.recorded}/{stats.enrolledStarted} học viên ghi nhận
    </p>
  )
}

function MetricInsight({ index, stats }: { index: MetricIndex; stats: TrainingDayStats }) {
  switch (index) {
    case 0: return <CourseBreakdownChips stats={stats} />
    case 1: return <AttendeeInsight stats={stats} />
    case 2: return <ExceptionInsight stats={stats} />
    case 3: return <ComplianceInsight stats={stats} />
  }
}

interface DailyMetricCardProps {
  data: KPIData
  meta: typeof METRIC_META[number]
  stats: TrainingDayStats
  index: MetricIndex
  embedded?: boolean
}

function DailyMetricCard({ data, meta, stats, index, embedded }: DailyMetricCardProps) {
  const { icon: Icon, iconColor, iconBg, accent } = meta
  const {
    label, value, unit, change, changeType,
    previousValue, higherIsBetter = true, changeUnit,
  } = data

  const isUp = changeType === 'increase'
  const isDown = changeType === 'decrease'
  const isNeutral = changeType === 'neutral'
  const isGood = higherIsBetter ? isUp : isDown
  const isBad = higherIsBetter ? isDown : isUp
  const showCompare = change !== undefined && changeType !== undefined
  const showYesterdayRow = showCompare && previousValue !== undefined

  return (
    <div className={cn(
      'border border-[#1e2433] border-l-2 rounded-lg flex flex-col gap-2 min-h-[96px]',
      'hover:border-[#2a3855]/80 transition-colors',
      'p-3',
      embedded ? 'bg-[#0b0f1a]' : 'bg-[#0d1117]',
      accent,
    )}>
      <div className="flex items-start gap-2.5 min-w-0">
        <div className={cn(
          'w-9 h-9 rounded-lg flex items-center justify-center shrink-0',
          iconBg,
        )}>
          <Icon className={cn('w-4 h-4', iconColor)} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide leading-tight truncate">
            {label}
          </p>
          <div className="flex items-baseline gap-1 mt-0.5">
            <span className={cn(
              'font-bold text-foreground leading-none tabular-nums tracking-tight',
              index === 3 ? 'text-3xl' : 'text-2xl',
            )}>
              {value}
            </span>
            {unit && (
              <span className="text-[11px] font-medium text-muted-foreground shrink-0">{unit}</span>
            )}
          </div>
          <MetricInsight index={index} stats={stats} />
        </div>
      </div>

      {showYesterdayRow && (
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#1e2433]/70 mt-auto">
          <span className="text-[10px] text-muted-foreground whitespace-nowrap truncate min-w-0">
            Hôm qua{' '}
            <span className="font-semibold text-muted-foreground/90 tabular-nums">
              {previousValue}{unit ? ` ${unit}` : ''}
            </span>
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
            {isNeutral ? 'Không đổi' : formatDelta(change!, changeUnit)}
          </span>
        </div>
      )}

      {showCompare && !showYesterdayRow && (
        <div className={cn(
          'flex items-center gap-1 text-[10px] font-medium pt-2 border-t border-[#1e2433]/70 mt-auto',
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
  )
}

interface TrainingDailyDashboardProps {
  summary: TrainingDailySummary
  /** KPI nằm trong Panel — tách nền card khỏi nền panel */
  embedded?: boolean
}

export function TrainingDailyDashboard({ summary, embedded }: TrainingDailyDashboardProps) {
  const { metrics, today } = summary

  return (
    <div className="grid grid-cols-1 min-[400px]:grid-cols-2 xl:grid-cols-4 gap-2.5 sm:gap-3">
      {metrics.map((metric, i) => (
        <DailyMetricCard
          key={metric.label}
          data={metric}
          meta={METRIC_META[i]}
          stats={today}
          index={i as MetricIndex}
          embedded={embedded}
        />
      ))}
    </div>
  )
}
