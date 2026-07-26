import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Bot,
  Camera,
  CircleCheck,
  ClipboardCheck,
  Clock,
  HardHat,
  Layers,
  Minus,
  Radio,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
  Volume2,
} from 'lucide-react'
import { cn } from '@/utils/cn'
import { IconTooltip, IconTooltipBadge } from '@/components/common/IconTooltip/IconTooltip'
import { MetricPercentRing } from '@/components/common/MetricPercentRing/MetricPercentRing'
import type { SafetyDashboardKpis, SafetyGroupStats } from '../../types/safety.types'
import { SAFETY_GROUP_MAP } from '../../data/safetyGroups'
import { GROUP_BADGE, GROUP_ICONS, SEVERITY_ICONS, SEVERITY_LABELS_UI } from '../../utils/safetyDashboardUi'

interface SafetyKpiStripProps {
  kpis: SafetyDashboardKpis
  groupStats: SafetyGroupStats[]
  embedded?: boolean
}

function ringHeatColor(percent: number, invert = false): string {
  const p = invert ? 100 - percent : percent
  if (p >= 85) return '#4ade80'
  if (p >= 65) return '#facc15'
  return '#f87171'
}

interface MetricCardProps {
  title: string
  accent: string
  icon: LucideIcon
  iconColor: string
  iconBg: string
  tip?: string
  embedded?: boolean
  value: ReactNode
  unit?: string
  insight: ReactNode
  ring?: ReactNode
  footer?: ReactNode
}

function MetricCard({
  title,
  accent,
  icon,
  iconColor,
  iconBg,
  tip,
  embedded,
  value,
  unit,
  insight,
  ring,
  footer,
}: MetricCardProps) {
  return (
    <div className={cn(
      'border border-[#1e2433] border-l-2 rounded-lg flex flex-col gap-1.5',
      'hover:border-[#2a3855]/80 transition-colors',
      'p-2.5 sm:p-3',
      embedded ? 'bg-[#0b0f1a]' : 'bg-[#0d1117]',
      accent,
    )}>
      <div className="flex items-start gap-1.5 sm:gap-2 min-w-0">
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5', iconBg)}>
          <IconTooltip icon={icon} label={title} tip={tip} iconClassName={iconColor} size="sm" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wide truncate leading-tight">
            {title}
          </p>
          <div className="flex items-baseline gap-0.5 sm:gap-1 mt-0.5 flex-wrap">
            <span className="font-bold leading-none tabular-nums tracking-tight text-base sm:text-2xl text-foreground">
              {value}
            </span>
            {unit && (
              <span className="text-[8px] sm:text-[10px] font-medium text-muted-foreground shrink-0">
                {unit}
              </span>
            )}
          </div>
          <div className="mt-0.5 sm:mt-1 min-w-0">{insight}</div>
        </div>
        {ring && (
          <div className="shrink-0 max-sm:hidden">
            {ring}
          </div>
        )}
      </div>
      {footer}
    </div>
  )
}

function DeviceInsight({ kpis }: { kpis: SafetyDashboardKpis }) {
  const chips = [
    { icon: Camera, label: 'Camera', tip: 'Camera cố định + PTZ', value: kpis.deviceBreakdown.find(d => d.key === 'camera')?.active ?? 0, className: 'bg-sky-500/10 text-sky-400' },
    { icon: HardHat, label: 'Body', tip: 'Bodycam', value: kpis.deviceBreakdown.find(d => d.key === 'bodycam')?.active ?? 0, className: 'bg-violet-500/10 text-violet-400' },
    { icon: Radio, label: 'Fly', tip: 'Flycam', value: kpis.deviceBreakdown.find(d => d.key === 'flycam')?.active ?? 0, className: 'bg-cyan-500/10 text-cyan-400' },
  ]

  return (
    <div className="flex flex-wrap gap-1">
      {chips.map(chip => (
        <IconTooltipBadge
          key={chip.label}
          icon={chip.icon}
          label={chip.label}
          tip={chip.tip}
          value={chip.value}
          className={chip.className}
        />
      ))}
    </div>
  )
}

function SeverityInsight({ kpis }: { kpis: SafetyDashboardKpis }) {
  const items = ([
    { key: 'CRITICAL' as const, value: kpis.criticalCount, className: 'bg-red-500/10 text-red-400' },
    { key: 'VIOLATION' as const, value: kpis.violationCount, className: 'bg-orange-500/10 text-orange-400' },
    { key: 'WARNING' as const, value: kpis.warningCount, className: 'bg-amber-500/10 text-amber-400' },
  ]).filter(item => item.value > 0)

  if (items.length === 0) {
    return <p className="text-[9px] text-muted-foreground/60 leading-snug">Không có vi phạm</p>
  }

  return (
    <div className="flex flex-wrap gap-1">
      {items.map(item => (
        <IconTooltipBadge
          key={item.key}
          icon={SEVERITY_ICONS[item.key]}
          label={SEVERITY_LABELS_UI[item.key]}
          tip={SEVERITY_LABELS_UI[item.key]}
          value={item.value}
          className={item.className}
        />
      ))}
    </div>
  )
}

function WorkflowInsight({ kpis }: { kpis: SafetyDashboardKpis }) {
  const chips = [
    {
      icon: Volume2,
      label: 'Loa',
      tip: 'AI xử lý qua Loa',
      value: kpis.aiSpeakerHandledCount,
      className: 'bg-red-500/10 text-red-400',
    },
    {
      icon: Bot,
      label: 'AI tự động',
      tip: 'AI xử lý tự động',
      value: kpis.aiAutoHandledCount,
      className: 'bg-emerald-500/10 text-emerald-400',
    },
    {
      icon: CircleCheck,
      label: 'Thủ công',
      tip: 'Đã xử lý thủ công',
      value: kpis.manualHandledCount,
      className: 'bg-green-500/10 text-green-400',
    },
    {
      icon: Clock,
      label: 'Chưa xử lý',
      tip: 'Chưa xử lý',
      value: kpis.unhandledCount,
      className: 'bg-amber-500/10 text-amber-400',
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-1 sm:flex sm:flex-wrap">
      {chips.map(chip => (
        <IconTooltipBadge
          key={chip.tip}
          icon={chip.icon}
          label={chip.label}
          tip={chip.tip}
          value={chip.value}
          className={cn(chip.className, 'min-w-0 justify-center sm:justify-start')}
        />
      ))}
    </div>
  )
}

function GroupInsight({ groupStats }: { groupStats: SafetyGroupStats[] }) {
  const active = groupStats.filter(g => g.total > 0)
  if (active.length === 0) {
    return <p className="text-[9px] text-muted-foreground/60 leading-snug">Không có vi phạm nhóm</p>
  }

  return (
    <div className="flex flex-wrap gap-1">
      {active.map(stat => {
        const Icon = GROUP_ICONS[stat.groupId]
        const group = SAFETY_GROUP_MAP.get(stat.groupId)
        return (
          <IconTooltipBadge
            key={stat.groupId}
            icon={Icon}
            label={stat.groupId}
            tip={group?.name ?? stat.groupId}
            value={stat.total}
            className={GROUP_BADGE[stat.groupId]}
          />
        )
      })}
    </div>
  )
}

function formatDelta(change: number): string {
  const prefix = change > 0 ? '+' : ''
  return `${prefix}${change}`
}

interface MetricCompareFooterProps {
  previousLabel: string
  delta: number
  higherIsBetter?: boolean
  title?: string
}

function MetricCompareFooter({
  previousLabel,
  delta,
  higherIsBetter = false,
  title,
}: MetricCompareFooterProps) {
  const isUp = delta > 0
  const isDown = delta < 0
  const isNeutral = delta === 0
  const isGood = higherIsBetter ? isUp : isDown
  const isBad = higherIsBetter ? isDown : isUp

  return (
    <div
      className="flex items-center justify-between gap-1.5 pt-1 sm:pt-1.5 border-t border-[#1e2433]/70 mt-auto min-w-0"
      title={title}
    >
      <span className="text-[8px] sm:text-[10px] text-muted-foreground truncate min-w-0 tabular-nums">
        <span className="font-semibold text-muted-foreground/90">
          {previousLabel}
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
        {isNeutral ? '—' : formatDelta(delta)}
      </span>
    </div>
  )
}

function ViolationDeltaFooter({ kpis }: { kpis: SafetyDashboardKpis }) {
  return (
    <MetricCompareFooter
      previousLabel={`${kpis.yesterdayViolations} vi phạm`}
      delta={kpis.todayViolations - kpis.yesterdayViolations}
      higherIsBetter={false}
      title={`Hôm qua: ${kpis.yesterdayViolations} vi phạm`}
    />
  )
}

export function SafetyKpiStrip({ kpis, groupStats, embedded = true }: SafetyKpiStripProps) {
  const devicePct = kpis.deviceTotalCount > 0
    ? Math.round((kpis.deviceActiveCount / kpis.deviceTotalCount) * 100)
    : 0
  const groupTotal = groupStats.reduce((sum, g) => sum + g.total, 0)
  const topGroup = [...groupStats].sort((a, b) => b.total - a.total)[0]
  const topGroupPct = groupTotal > 0 && topGroup
    ? Math.round((topGroup.total / groupTotal) * 100)
    : 0

  return (
    <div className="grid grid-cols-1 min-[400px]:grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-2.5 lg:gap-3">
      <MetricCard
        title="Thiết bị"
        accent="border-l-sky-500/50"
        icon={Camera}
        iconColor="text-sky-400"
        iconBg="bg-sky-500/10"
        tip="Thiết bị giám sát đang hoạt động"
        embedded={embedded}
        value={kpis.deviceActiveCount}
        unit="thiết bị"
        insight={<DeviceInsight kpis={kpis} />}
        ring={(
          <MetricPercentRing
            percent={devicePct}
            color={ringHeatColor(devicePct)}
            size={46}
            className="mt-0.5"
            title={`${kpis.deviceActiveCount} thiết bị online`}
          />
        )}
        footer={(
          <MetricCompareFooter
            previousLabel={`${kpis.yesterdayDeviceActiveCount} thiết bị`}
            delta={kpis.deviceActiveCount - kpis.yesterdayDeviceActiveCount}
            higherIsBetter
            title={`Hôm qua: ${kpis.yesterdayDeviceActiveCount} thiết bị online`}
          />
        )}
      />

      <MetricCard
        title="Vi phạm"
        accent="border-l-orange-500/50"
        icon={ShieldAlert}
        iconColor="text-orange-400"
        iconBg="bg-orange-500/10"
        tip="Tổng vi phạm hôm nay theo mức độ"
        embedded={embedded}
        value={kpis.todayViolations}
        unit="vi phạm"
        insight={<SeverityInsight kpis={kpis} />}
        ring={kpis.todayViolations > 0 ? (
          <MetricPercentRing
            percent={Math.round((kpis.criticalCount / kpis.todayViolations) * 100)}
            color="#ef4444"
            size={46}
            className="mt-0.5"
            title={`${kpis.criticalCount} khẩn cấp / ${kpis.todayViolations} tổng`}
          />
        ) : undefined}
        footer={<ViolationDeltaFooter kpis={kpis} />}
      />

      <MetricCard
        title="Xử lý"
        accent="border-l-green-500/50"
        icon={ClipboardCheck}
        iconColor="text-green-400"
        iconBg="bg-green-500/10"
        tip="Tiến độ xử lý — đồng bộ trạng thái Cảnh báo"
        embedded={embedded}
        value={kpis.handledTotalCount}
        unit="xử lý"
        insight={<WorkflowInsight kpis={kpis} />}
        ring={kpis.todayViolations > 0 ? (
          <MetricPercentRing
            percent={kpis.handledRate}
            color={ringHeatColor(kpis.handledRate)}
            size={46}
            className="mt-0.5"
            title={`${kpis.handledRate}% đã xử lý`}
          />
        ) : undefined}
        footer={(
          <MetricCompareFooter
            previousLabel={`${kpis.yesterdayHandledTotalCount} xử lý`}
            delta={kpis.handledRate - kpis.yesterdayHandledRate}
            higherIsBetter
            title={`Hôm qua: ${kpis.yesterdayHandledTotalCount} xử lý (${kpis.yesterdayHandledRate}%)`}
          />
        )}
      />

      <MetricCard
        title="Nhóm ATLĐ"
        accent="border-l-primary/50"
        icon={Layers}
        iconColor="text-primary"
        iconBg="bg-primary/10"
        tip="Vi phạm theo 6 nhóm giám sát ATLĐ"
        embedded={embedded}
        value={groupTotal}
        unit="vi phạm"
        insight={<GroupInsight groupStats={groupStats} />}
        ring={groupTotal > 0 && topGroup ? (
          <MetricPercentRing
            percent={topGroupPct}
            color={ringHeatColor(topGroupPct, true)}
            size={46}
            className="mt-0.5"
            title={`${topGroup.groupId} · ${topGroup.total}`}
          />
        ) : undefined}
        footer={(
          <MetricCompareFooter
            previousLabel={`${kpis.yesterdayGroupTotal} vi phạm`}
            delta={groupTotal - kpis.yesterdayGroupTotal}
            higherIsBetter={false}
            title={`Hôm qua: ${kpis.yesterdayGroupTotal} vi phạm nhóm ATLĐ`}
          />
        )}
      />
    </div>
  )
}
