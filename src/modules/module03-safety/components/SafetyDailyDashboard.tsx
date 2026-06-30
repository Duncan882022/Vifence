import {
  TrendingUp, TrendingDown,
  Clock, CheckCircle2, Radio, AlertCircle, AlertTriangle, Minus,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { IconTooltip, IconTooltipBadge } from '@/components/common/IconTooltip/IconTooltip'
import { MetricPercentRing } from '@/components/common/MetricPercentRing/MetricPercentRing'
import type { KPIData } from '@/types/api'
import { percentToHeatColor } from '@/modules/module02-training/services/trainingKpi.service'
import type { SafetyDailySummary, SafetyDayStats } from '../services/safetyKpi.service'
import { SAFETY_METRIC_META } from '../data/safetyMetricMeta'
import { getPpeLevel, formatPpeScore } from '../utils/safetyUiHelpers'
import { PpeComplianceTooltip } from './PpeComplianceTooltip'
import { ViolationTypeChips } from './ViolationTypeChips'

type MetricIndex = 0 | 1 | 2 | 3

function formatDelta(change: number, changeUnit?: string): string {
  const prefix = change > 0 ? '+' : ''
  const suffix = changeUnit ? ` ${changeUnit}` : ''
  return `${prefix}${change}${suffix}`
}

function ringHeatColor(percent: number, invert = false): string {
  return percentToHeatColor(invert ? 100 - percent : percent)
}

function PenaltyStatusChips({ stats }: { stats: SafetyDayStats }) {
  const total = stats.penaltiesResolved + stats.penaltiesPending
  if (total <= 0) {
    return <p className="text-[9px] text-muted-foreground/60 leading-snug">Chưa có quyết định xử phạt</p>
  }

  const chips = [
    {
      value: stats.penaltiesResolved,
      icon: CheckCircle2,
      tip: 'Đã xử lý',
      colorCls: 'bg-green-500/10 text-green-400 border-green-500/30',
    },
    {
      value: stats.penaltiesPending,
      icon: Clock,
      tip: 'Chưa xử lý',
      colorCls: 'bg-red-500/10 text-red-400 border-red-500/30',
      pulse: stats.penaltiesPending > 0,
    },
  ].filter(c => c.value > 0)

  return (
    <div className="flex flex-wrap gap-1">
      {chips.map(chip => (
        <span
          key={chip.tip}
          title={chip.tip}
          aria-label={`${chip.tip}: ${chip.value}`}
          className={cn(
            'inline-flex items-center gap-1 px-1.5 py-0.5 rounded',
            'border text-[9px] font-medium tabular-nums',
            chip.colorCls,
          )}
        >
          {chip.pulse && (
            <span className="w-1.5 h-1.5 rounded-full animate-pulse bg-current shrink-0" />
          )}
          <chip.icon className="w-3.5 h-3.5 shrink-0 opacity-90" aria-hidden />
          <span>{chip.value}</span>
        </span>
      ))}
    </div>
  )
}

function CameraInsight({ stats }: { stats: SafetyDayStats }) {
  return (
    <div className="flex flex-wrap gap-1">
      <IconTooltipBadge
        icon={Radio}
        label="Đang phát"
        tip="Luồng live OCP1"
        value={stats.activeCameras}
        className="bg-cyan-500/10 text-cyan-400"
        pulse
      />
    </div>
  )
}

function MetricInsight({ index, stats }: { index: MetricIndex; stats: SafetyDayStats }) {
  switch (index) {
    case 0: {
      const ppeLevel = getPpeLevel(stats.ppeCompliance)
      const levelChips = [
        { count: stats.violationsHigh, label: 'Cao', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/30', Icon: AlertCircle, tip: 'Mức cao · −5đ/vi phạm' },
        { count: stats.violationsMedium, label: 'TB', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', Icon: AlertTriangle, tip: 'Trung bình · −2đ/vi phạm' },
        { count: stats.violationsLow, label: 'Thấp', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30', Icon: Minus, tip: 'Mức thấp · −1đ/vi phạm' },
      ].filter(c => c.count > 0)

      return (
        <div className="space-y-0.5">
          <p className="text-[9px] text-muted-foreground/70 leading-snug truncate">
            <span className={cn('font-semibold', ppeLevel.color)}>Mức {ppeLevel.label}</span>
          </p>
          {levelChips.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {levelChips.map(chip => (
                <span
                  key={chip.label}
                  title={chip.tip}
                  className={cn(
                    'inline-flex items-center gap-1 px-1.5 py-0.5 rounded',
                    'border text-[9px] font-medium tabular-nums',
                    chip.color, chip.bg, chip.border,
                  )}
                >
                  <chip.Icon className="w-3.5 h-3.5" aria-hidden />
                  ×{chip.count}
                </span>
              ))}
            </div>
          )}
        </div>
      )
    }
    case 1:
      return <ViolationTypeChips stats={stats} />
    case 2:
      return <CameraInsight stats={stats} />
    case 3:
      return <PenaltyStatusChips stats={stats} />
  }
}

function MetricRightVisual({ index, stats }: { index: MetricIndex; stats: SafetyDayStats }) {
  switch (index) {
    case 0: {
      const ppeLevel = getPpeLevel(stats.ppeCompliance)
      return (
        <MetricPercentRing
          percent={stats.ppeCompliance}
          color={ppeLevel.ringColor}
          size={46}
          className="mt-0.5"
          title={`${formatPpeScore(stats.ppeCompliance)}% tuân thủ PPE · Mức ${ppeLevel.label}`}
        />
      )
    }
    case 1:
      if (stats.violationsToday <= 0) return null
      return (
        <MetricPercentRing
          percent={Math.min(100, stats.violationsToday * 20)}
          color={ringHeatColor(Math.max(0, 100 - stats.violationsToday * 15), true)}
          size={46}
          className="mt-0.5"
          title={`${stats.violationsToday} vi phạm hôm nay`}
        />
      )
    case 2:
      if (stats.totalCameras <= 0) return null
      return (
        <MetricPercentRing
          percent={Math.round((stats.activeCameras / stats.totalCameras) * 100)}
          color={ringHeatColor(Math.round((stats.activeCameras / stats.totalCameras) * 100))}
          size={46}
          className="mt-0.5"
          title={`${stats.activeCameras}/${stats.totalCameras} camera OCP1`}
        />
      )
    case 3: {
      const total = stats.penaltiesResolved + stats.penaltiesPending
      if (total <= 0) return null
      const resolvedPct = Math.round((stats.penaltiesResolved / total) * 100)
      return (
        <MetricPercentRing
          percent={resolvedPct}
          color={ringHeatColor(resolvedPct)}
          size={46}
          className="mt-0.5"
          title={`${stats.penaltiesResolved} đã xử lý · ${stats.penaltiesPending} chưa xử lý`}
        />
      )
    }
  }
}

interface DailyMetricCardProps {
  data: KPIData
  meta: typeof SAFETY_METRIC_META[number]
  stats: SafetyDayStats
  index: MetricIndex
  embedded?: boolean
}

function DailyMetricCard({ data, meta, stats, index, embedded }: DailyMetricCardProps) {
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
  const showFraction = detail?.startsWith('/')
  const isPpe = index === 0
  const isPenalties = index === 3
  const ppeLevel = isPpe ? getPpeLevel(Number(value)) : null
  const PpeIcon = ppeLevel?.icon

  return (
    <div className={cn(
      'border border-[#1e2433] border-l-2 rounded-lg flex flex-col gap-1.5',
      'hover:border-[#2a3855]/80 transition-colors',
      'p-2.5 sm:p-3',
      embedded ? 'bg-[#0b0f1a]' : 'bg-[#0d1117]',
      accent,
    )}>
      <div className="flex items-start gap-1.5 sm:gap-2 min-w-0">
        <div className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5',
          isPpe && ppeLevel ? ppeLevel.bg : iconBg,
        )}>
          {isPpe && PpeIcon ? (
            <PpeComplianceTooltip
              score={Number(value)}
              violationsByLevel={{ high: stats.violationsHigh, medium: stats.violationsMedium, low: stats.violationsLow }}
            >
              <button
                type="button"
                className="inline-flex items-center justify-center cursor-help rounded-md focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
                aria-label={`Tuân thủ PPE · Mức ${ppeLevel!.label}`}
              >
                <PpeIcon className={cn('w-3.5 h-3.5', ppeLevel!.color)} aria-hidden />
              </button>
            </PpeComplianceTooltip>
          ) : (
            <IconTooltip icon={Icon} label={label} tip={tip} iconClassName={iconColor} size="sm" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 min-w-0">
            <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide truncate leading-tight">
              {label}
            </p>
            {isPpe && (
              <PpeComplianceTooltip
                score={Number(value)}
                violationsByLevel={{ high: stats.violationsHigh, medium: stats.violationsMedium, low: stats.violationsLow }}
                iconClassName="w-2.5 h-2.5"
              />
            )}
          </div>
          <div className="flex items-baseline gap-0.5 sm:gap-1 mt-0.5 flex-wrap">
            {isPpe ? (
              <>
                <span
                  className="font-bold leading-none tabular-nums tracking-tight text-base sm:text-2xl transition-colors duration-500"
                  style={{ color: ppeLevel!.ringColor }}
                >
                  {formatPpeScore(Number(value))}
                </span>
                {unit && (
                  <span
                    className="text-[8px] sm:text-[10px] font-medium shrink-0 transition-colors duration-500"
                    style={{ color: ppeLevel!.ringColor }}
                  >
                    {unit}
                  </span>
                )}
              </>
            ) : isPenalties ? (
              <>
                <span className="font-bold leading-none tabular-nums tracking-tight text-base sm:text-2xl text-green-400">
                  {stats.penaltiesResolved}
                </span>
                <span className="text-[10px] sm:text-xs font-medium text-muted-foreground/60 shrink-0">/</span>
                <span className={cn(
                  'font-bold leading-none tabular-nums tracking-tight text-base sm:text-2xl',
                  stats.penaltiesPending > 0 ? 'text-red-400' : 'text-green-400',
                )}>
                  {stats.penaltiesPending}
                </span>
              </>
            ) : showFraction ? (
              <>
                <span className="font-bold leading-none tabular-nums tracking-tight text-base sm:text-2xl text-foreground">
                  {value}
                </span>
                <span className="text-[8px] sm:text-[10px] font-medium text-muted-foreground shrink-0">{detail}</span>
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
    </div>
  )
}

interface SafetyDailyDashboardProps {
  summary: SafetyDailySummary
  embedded?: boolean
}

export function SafetyDailyDashboard({ summary, embedded }: SafetyDailyDashboardProps) {
  const { metrics, today } = summary

  return (
    <div className="grid grid-cols-2 min-[520px]:grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-2.5 lg:gap-3">
      {metrics.map((metric, i) => (
        <DailyMetricCard
          key={metric.label}
          data={metric}
          meta={SAFETY_METRIC_META[i as MetricIndex]}
          stats={today}
          index={i as MetricIndex}
          embedded={embedded}
        />
      ))}
    </div>
  )
}
