import {
  TrendingUp, TrendingDown, Minus,
  Clock, Radio, Ban, CheckCircle2, LogIn, LogOut, UserX,
  DoorOpen, Hourglass, AlertTriangle,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/utils/cn'
import { IconTooltip, IconTooltipBadge } from '@/components/common/IconTooltip/IconTooltip'
import { MetricPercentRing } from '@/components/common/MetricPercentRing/MetricPercentRing'
import type { KPIData } from '@/types/api'
import {
  formatCourseDayRingTitle,
  percentToHeatColor,
  type TrainingDailySummary,
  type TrainingDayStats,
} from '../services/trainingKpi.service'
import {
  attendanceStatusConfig,
  EXCEPTION_ATTENDANCE_STATUSES,
  type AttendanceStatus,
} from './TrainingEventTable'
import { ComplianceFactorsChart } from './ComplianceFactorsChart'
import { TRAINING_METRIC_META } from '../data/trainingMetricMeta'

type MetricIndex = 0 | 1 | 2 | 3

const NO_CLASS_YET = 'Chưa có lớp nào bắt đầu'

function ringHeatColor(percent: number, invert = false): string {
  return percentToHeatColor(invert ? 100 - percent : percent)
}

const EXCEPTION_DISPLAY_ORDER = EXCEPTION_ATTENDANCE_STATUSES

const EXCEPTION_STATUS_ICONS: Partial<Record<AttendanceStatus, LucideIcon>> = {
  late: Clock,
  'left-early': LogOut,
  skipped: DoorOpen,
  insufficient: Hourglass,
  absent: UserX,
}

function formatPercentDisplay(percent: number): string {
  return Number.isInteger(percent) ? String(percent) : percent.toFixed(1)
}

interface PrimaryMetricDisplay {
  value: number
  heatColor: string
  unit?: string
}

function getPrimaryMetricDisplay(index: MetricIndex, stats: TrainingDayStats): PrimaryMetricDisplay | null {
  switch (index) {
    case 0:
      return null
    case 1:
      return null
    case 2:
      return null
    case 3:
      return {
        value: stats.complianceScore,
        heatColor: percentToHeatColor(stats.complianceScore),
        unit: 'điểm',
      }
    default:
      return null
  }
}

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
      tip: 'Lớp sắp diễn ra',
      className: 'bg-blue-500/10 text-blue-400',
    },
    {
      value: stats.coursesLive > 0 ? stats.coursesLive : stats.coursesActive,
      icon: Radio,
      tip: 'Lớp đang diễn ra',
      className: 'bg-green-500/10 text-green-400',
      pulse: stats.coursesLive > 0,
    },
    {
      value: stats.coursesCancelled,
      icon: Ban,
      tip: 'Lớp đã huỷ',
      className: 'bg-red-500/10 text-red-400',
    },
    {
      value: stats.coursesCompleted,
      icon: CheckCircle2,
      tip: 'Lớp đã hoàn thành',
      className: 'bg-gray-500/10 text-gray-400',
    },
  ]

  return (
    <div className="flex flex-wrap gap-1">
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

function AttendeeLiveInsight({ stats }: { stats: TrainingDayStats }) {
  if (stats.enrolledStarted === 0) {
    return (
      <p className="text-[10px] text-muted-foreground/75 leading-snug">{NO_CLASS_YET}</p>
    )
  }

  if (stats.enrolledLive === 0) {
    return (
      <p className="text-[9px] text-muted-foreground/60 leading-snug">
        Chưa có lớp live
      </p>
    )
  }

  const attendingCfg = attendanceStatusConfig.attending
  const absentCfg = attendanceStatusConfig.absent
  const chips = [
    {
      value: stats.studyingNow,
      icon: LogIn,
      tip: attendingCfg.label,
      label: attendingCfg.label,
      className: cn(attendingCfg.bg, attendingCfg.color),
      pulse: true,
    },
    ...(stats.absentLive > 0
      ? [{
          value: stats.absentLive,
          icon: UserX,
          tip: absentCfg.label,
          label: absentCfg.label,
          className: cn(absentCfg.bg, absentCfg.color),
        }]
      : []),
  ]

  return (
    <div className="flex flex-wrap gap-1">
      {chips.map(chip => (
        <IconTooltipBadge
          key={chip.tip}
          icon={chip.icon}
          label={chip.label}
          tip={chip.tip}
          value={chip.value}
          className={chip.className}
          pulse={chip.pulse}
        />
      ))}
    </div>
  )
}

function ExceptionBreakdown({ stats }: { stats: TrainingDayStats }) {
  const entries = EXCEPTION_DISPLAY_ORDER
    .map((status: AttendanceStatus) => ({
      status,
      count: stats.exceptionByStatus[status] ?? 0,
    }))
    .filter(e => e.count > 0)

  if (entries.length === 0) {
    return (
      <p className="text-[9px] text-muted-foreground/60 leading-snug">Không có ngoại lệ</p>
    )
  }

  return (
    <div className="flex flex-wrap gap-1">
      {entries.map(({ status, count }) => {
        const cfg = attendanceStatusConfig[status]
        const Icon = EXCEPTION_STATUS_ICONS[status] ?? AlertTriangle
        return (
          <IconTooltipBadge
            key={status}
            icon={Icon}
            label={cfg.label}
            tip={cfg.label}
            value={count}
            className={cn(cfg.bg, cfg.color)}
          />
        )
      })}
    </div>
  )
}

function MetricInsight({ index, stats }: { index: MetricIndex; stats: TrainingDayStats }) {
  switch (index) {
    case 0: return <CourseBreakdownChips stats={stats} />
    case 1: return <AttendeeLiveInsight stats={stats} />
    case 2: return <ExceptionBreakdown stats={stats} />
    case 3: return <ComplianceFactorsChart stats={stats} className="mt-1" />
  }
}

function MetricRightVisual({
  index,
  stats,
}: {
  index: MetricIndex
  stats: TrainingDayStats
}) {
  switch (index) {
    case 0:
      if (stats.coursesTotal <= 0) return null
      return (
        <MetricPercentRing
          percent={stats.courseDayProgressRate}
          color={ringHeatColor(stats.courseDayProgressRate)}
          size={46}
          className="mt-0.5"
          title={formatCourseDayRingTitle(stats)}
        />
      )
    case 1:
      if (stats.enrolledStarted <= 0) return null
      return (
        <MetricPercentRing
          percent={stats.attendanceRate}
          color={ringHeatColor(stats.attendanceRate)}
          size={46}
          className="mt-0.5"
          title={`${stats.attendanceRate}% ghi nhận · ${stats.recorded}/${stats.enrolledStarted} học viên`}
        />
      )
    case 2:
      if (stats.enrolledStarted <= 0) return null
      return (
        <MetricPercentRing
          percent={stats.exceptionRate}
          color={ringHeatColor(stats.exceptionRate, true)}
          size={46}
          className="mt-0.5"
          title={
            stats.enrolledLive > 0
              ? `${stats.exceptionRate}% ngoại lệ · ${stats.exceptions}/${stats.studyingNow} HV đang học`
              : `${stats.exceptionRate}% ngoại lệ`
          }
        />
      )
    case 3:
      return (
        <MetricPercentRing
          percent={stats.complianceScore}
          color={ringHeatColor(stats.complianceScore)}
          size={46}
          className="mt-0.5"
          title={`${stats.complianceScore} điểm tuân thủ`}
        />
      )
  }
}

interface DailyMetricCardProps {
  data: KPIData
  meta: typeof TRAINING_METRIC_META[number]
  stats: TrainingDayStats
  index: MetricIndex
  embedded?: boolean
  className?: string
}

function DailyMetricCard({
  data, meta, stats, index, embedded, className,
}: DailyMetricCardProps) {
  const { icon: Icon, iconColor, iconBg, accent, tip } = meta
  const {
    label, value, unit, detail, change, changeType,
    previousValue, higherIsBetter = true, changeUnit,
  } = data

  const isUp = changeType === 'increase'
  const isDown = changeType === 'decrease'
  const isNeutral = changeType === 'neutral'
  const isGood = higherIsBetter ? isUp : isDown
  const isBad = higherIsBetter ? isDown : isUp
  const showCompare = change !== undefined && changeType !== undefined
  const showYesterdayRow = showCompare && previousValue !== undefined
  const primary = getPrimaryMetricDisplay(index, stats)
  const showAttendeeFraction = !primary && detail?.startsWith('/')

  return (
    <div className={cn(
      'border border-[#1e2433] border-l-2 rounded-lg flex flex-col gap-1.5',
      'hover:border-[#2a3855]/80 transition-colors',
      'p-2.5 sm:p-3',
      embedded ? 'bg-[#0b0f1a]' : 'bg-[#0d1117]',
      accent,
      className,
    )}>
      <div className="flex items-start gap-1.5 max-lg:gap-1.5 sm:gap-2 min-w-0">
        <div className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
          iconBg,
        )}>
          <IconTooltip icon={Icon} label={label} tip={tip} iconClassName={iconColor} size="sm" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide truncate leading-tight">
            {label}
          </p>
          <div className="flex items-baseline gap-0.5 sm:gap-1 mt-0.5 flex-wrap">
            {primary ? (
              <>
                <span
                  className="font-bold leading-none tabular-nums tracking-tight text-base sm:text-2xl transition-colors duration-500"
                  style={{ color: primary.heatColor }}
                >
                  {formatPercentDisplay(primary.value)}
                </span>
                {primary.unit && (
                  <span
                    className="text-[8px] sm:text-[10px] font-medium shrink-0 transition-colors duration-500"
                    style={{ color: primary.heatColor }}
                  >
                    {primary.unit}
                  </span>
                )}
              </>
            ) : showAttendeeFraction ? (
              <>
                <span className="font-bold leading-none tabular-nums tracking-tight text-base sm:text-2xl text-foreground">
                  {value}
                </span>
                <span className="text-[8px] sm:text-[10px] font-medium text-muted-foreground shrink-0">/</span>
                <span className="font-bold leading-none tabular-nums tracking-tight text-base sm:text-2xl text-foreground">
                  {detail!.slice(1)}
                </span>
                {unit && (
                  <span className="text-[8px] sm:text-[10px] font-medium text-muted-foreground shrink-0">{unit}</span>
                )}
              </>
            ) : (
              <>
                <span className="font-bold leading-none tabular-nums tracking-tight text-base sm:text-2xl text-foreground">
                  {value}
                </span>
                {unit && (
                  <span className="text-[8px] sm:text-[10px] font-medium text-muted-foreground shrink-0">{unit}</span>
                )}
              </>
            )}
          </div>
          <div className="mt-0.5 sm:mt-1 min-w-0">
            <MetricInsight index={index} stats={stats} />
          </div>
        </div>
        <div className="shrink-0 max-lg:scale-[0.82] max-lg:origin-top-right">
          <MetricRightVisual index={index} stats={stats} />
        </div>
      </div>

      {showYesterdayRow && (
        <div
          className="flex items-center justify-between gap-1.5 pt-1 sm:pt-1.5 border-t border-[#1e2433]/70 mt-auto min-w-0"
          title={`Hôm qua: ${previousValue}${unit ? ` ${unit}` : ''}`}
        >
          <span className="text-[8px] sm:text-[10px] text-muted-foreground truncate min-w-0 tabular-nums">
            <span className="font-semibold text-muted-foreground/90">
              {previousValue}{unit ? ` ${unit}` : ''}
            </span>
          </span>
          <span className={cn(
            'inline-flex items-center gap-0.5 text-[8px] sm:text-[10px] font-semibold tabular-nums shrink-0',
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
          'flex items-center gap-1 text-[8px] sm:text-[10px] font-medium pt-1 sm:pt-1.5 border-t border-[#1e2433]/70 mt-auto',
          isGood && 'text-green-400',
          isBad && 'text-red-400',
          isNeutral && 'text-muted-foreground',
        )}>
          {isUp && <TrendingUp className="w-3 h-3 shrink-0" />}
          {isDown && <TrendingDown className="w-3 h-3 shrink-0" />}
          {isNeutral && <Minus className="w-3 h-3 shrink-0" />}
          <span className="truncate">
            {isNeutral ? 'Không đổi' : formatDelta(change!, changeUnit)}
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
    <div className="grid grid-cols-2 min-[520px]:grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-2.5 lg:gap-3">
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
