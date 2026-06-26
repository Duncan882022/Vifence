import {
  TrendingUp, TrendingDown, Minus,
  Clock, Radio, Ban, CheckCircle2,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { IconTooltip, IconTooltipBadge } from '@/components/common/IconTooltip/IconTooltip'
import type { KPIData } from '@/types/api'
import type { TrainingDailySummary, TrainingDayStats } from '../services/trainingKpi.service'
import { TRAINING_METRIC_META } from '../data/trainingMetricMeta'

type MetricIndex = 0 | 1 | 2 | 3

function formatDelta(change: number, changeUnit?: string): string {
  const prefix = change > 0 ? '+' : ''
  const suffix = changeUnit ? ` ${changeUnit}` : ''
  return `${prefix}${change}${suffix}`
}

function CourseBreakdownChips({ stats }: { stats: TrainingDayStats }) {
  const chips = [
    {
      value: stats.coursesUpcoming,
      icon: Clock,
      tip: 'Ca sắp diễn ra',
      className: 'bg-sky-500/10 text-sky-400',
    },
    {
      value: stats.coursesLive > 0 ? stats.coursesLive : stats.coursesActive,
      icon: Radio,
      tip: 'Ca đang diễn ra',
      className: 'bg-green-500/10 text-green-400',
      pulse: stats.coursesLive > 0,
    },
    {
      value: stats.coursesCancelled,
      icon: Ban,
      tip: 'Ca đã huỷ',
      className: 'bg-red-500/10 text-red-400',
    },
    {
      value: stats.coursesCompleted,
      icon: CheckCircle2,
      tip: 'Ca đã hoàn thành',
      className: 'bg-gray-500/10 text-gray-400',
    },
  ]

  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {chips.map(chip => (
        <IconTooltipBadge
          key={chip.tip}
          icon={chip.icon}
          label={chip.tip}
          tip={chip.tip}
          value={chip.value}
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
      <p
        className="text-[10px] font-semibold text-sky-400 tabular-nums leading-snug"
        title={`${stats.recorded}/${stats.enrolledStarted} ca đã chạy (${coverage}%)`}
      >
        {stats.recorded}/{stats.enrolledStarted} ca
        <span className="text-muted-foreground/60 font-medium ml-1">({coverage}%)</span>
      </p>
      {stats.studyingNow > 0 && (
        <p
          className="text-[9px] text-muted-foreground/70 leading-snug"
          title={`${stats.studyingNow} học viên đang học`}
        >
          <span className="inline-flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-sky-400 shrink-0" />
            <span className="font-semibold text-sky-400 tabular-nums">{stats.studyingNow}</span>
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
      <p
        className="text-[10px] font-semibold text-orange-400 tabular-nums leading-snug"
        title={`${rate}% ngoại lệ trên ca đã chạy`}
      >
        {rate}%
      </p>
      <p
        className="text-[9px] text-muted-foreground/70 leading-snug"
        title={`${stats.exceptions}/${stats.enrolledStarted} học viên ngoại lệ`}
      >
        {stats.exceptions}/{stats.enrolledStarted} HV
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
    <p
      className="text-[10px] font-semibold text-blue-400/90 tabular-nums mt-1 leading-snug"
      title={`${stats.recorded}/${stats.enrolledStarted} học viên ghi nhận`}
    >
      {stats.recorded}/{stats.enrolledStarted} HV
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
  meta: typeof TRAINING_METRIC_META[number]
  stats: TrainingDayStats
  index: MetricIndex
  embedded?: boolean
}

function DailyMetricCard({ data, meta, stats, index, embedded }: DailyMetricCardProps) {
  const { icon: Icon, iconColor, iconBg, accent, tip } = meta
  const {
    value, unit, change, changeType,
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
      <div className="flex items-center gap-2.5 min-w-0">
        <div className={cn(
          'w-9 h-9 rounded-lg flex items-center justify-center shrink-0 self-center',
          iconBg,
        )}>
          <IconTooltip icon={Icon} label={tip} iconClassName={iconColor} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-1">
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
        </div>
      </div>
      <div className="pl-11 min-w-0">
        <MetricInsight index={index} stats={stats} />
      </div>

      {showYesterdayRow && (
        <div
          className="flex items-center justify-between gap-2 pt-2 border-t border-[#1e2433]/70 mt-auto"
          title={`Hôm qua: ${previousValue}${unit ? ` ${unit}` : ''}`}
        >
          <span className="text-[10px] text-muted-foreground whitespace-nowrap truncate min-w-0 tabular-nums">
            <span className="font-semibold text-muted-foreground/90">
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
            {isNeutral ? '—' : formatDelta(change!, changeUnit)}
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
              ? 'Không đổi'
              : formatDelta(change!, changeUnit)}
          </span>
        </div>
      )}
    </div>
  )
}

interface TrainingDailyDashboardProps {
  summary: TrainingDailySummary
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
          meta={TRAINING_METRIC_META[i]}
          stats={today}
          index={i as MetricIndex}
          embedded={embedded}
        />
      ))}
    </div>
  )
}
