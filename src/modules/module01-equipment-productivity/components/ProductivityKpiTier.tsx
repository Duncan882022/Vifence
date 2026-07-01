import { type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Clock, Gauge, Pickaxe, Fuel, TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { FleetSummary, UtilizationKpi, OutputKpi, FuelKpi } from '../types'

const CARD_EASE = [0.22, 1, 0.36, 1] as const

const CARD_VARIANTS = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.07, duration: 0.45, ease: CARD_EASE },
  }),
}

interface CardTheme {
  accent: string
  accentHover: string
  glow: string
  hoverShadow: string
  iconBg: string
  iconRing: string
  iconColor: string
}

const THEMES = {
  sky: {
    accent: 'border-l-sky-400/80',
    accentHover: 'hover:border-l-sky-400',
    glow: 'bg-[radial-gradient(ellipse_80%_70%_at_100%_0%,rgba(56,189,248,0.13),transparent_60%)]',
    hoverShadow: 'hover:shadow-[0_8px_32px_rgba(56,189,248,0.09)]',
    iconBg: 'bg-sky-500/15',
    iconRing: 'ring-sky-400/35',
    iconColor: 'text-sky-400',
  },
  emerald: {
    accent: 'border-l-emerald-400/80',
    accentHover: 'hover:border-l-emerald-400',
    glow: 'bg-[radial-gradient(ellipse_80%_70%_at_100%_0%,rgba(52,211,153,0.12),transparent_60%)]',
    hoverShadow: 'hover:shadow-[0_8px_32px_rgba(52,211,153,0.09)]',
    iconBg: 'bg-emerald-500/15',
    iconRing: 'ring-emerald-400/35',
    iconColor: 'text-emerald-400',
  },
  violet: {
    accent: 'border-l-violet-400/80',
    accentHover: 'hover:border-l-violet-400',
    glow: 'bg-[radial-gradient(ellipse_80%_70%_at_100%_0%,rgba(167,139,250,0.12),transparent_60%)]',
    hoverShadow: 'hover:shadow-[0_8px_32px_rgba(167,139,250,0.09)]',
    iconBg: 'bg-violet-500/15',
    iconRing: 'ring-violet-400/35',
    iconColor: 'text-violet-400',
  },
  amber: {
    accent: 'border-l-amber-400/80',
    accentHover: 'hover:border-l-amber-400',
    glow: 'bg-[radial-gradient(ellipse_80%_70%_at_100%_0%,rgba(251,191,36,0.13),transparent_60%)]',
    hoverShadow: 'hover:shadow-[0_8px_32px_rgba(251,191,36,0.09)]',
    iconBg: 'bg-amber-500/15',
    iconRing: 'ring-amber-400/35',
    iconColor: 'text-amber-400',
  },
} as const satisfies Record<string, CardTheme>

function TrendBadge({ value, invert, suffix = '%' }: { value: number; invert?: boolean; suffix?: string }) {
  const positive = invert ? value <= 0 : value >= 0
  return (
    <span className={cn(
      'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[7px] font-semibold tabular-nums border',
      positive
        ? 'bg-green-500/10 text-green-400 border-green-500/25'
        : 'bg-red-500/10 text-red-400 border-red-500/25',
    )}>
      {positive
        ? <TrendingUp className="w-2 h-2 shrink-0" />
        : <TrendingDown className="w-2 h-2 shrink-0" />
      }
      {value > 0 ? '+' : ''}{value}{suffix}
    </span>
  )
}

function KpiShell({
  theme, icon, title, headerRight, children, index,
}: {
  theme: CardTheme
  icon: ReactNode
  title: string
  headerRight?: ReactNode
  children: ReactNode
  index: number
}) {
  return (
    <motion.div
      custom={index}
      variants={CARD_VARIANTS}
      initial="hidden"
      animate="visible"
      className={cn(
        'group relative overflow-hidden rounded-2xl border border-[#1e2433]/90 border-l-[3px]',
        'bg-gradient-to-br from-[#0d1117] via-[#0a0e1a] to-[#060b14]',
        'transition-all duration-300',
        theme.accent, theme.accentHover, theme.hoverShadow,
      )}
    >
      <div className={cn('absolute inset-0 pointer-events-none', theme.glow)} />
      <div className="relative px-3 pt-2.5 pb-3 flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5">
            <div className={cn('w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ring-1', theme.iconBg, theme.iconRing)}>
              <span className={theme.iconColor}>{icon}</span>
            </div>
            <p className="text-[8px] font-bold text-muted-foreground uppercase tracking-widest">{title}</p>
          </div>
          {headerRight && <div className="shrink-0">{headerRight}</div>}
        </div>
        {children}
      </div>
    </motion.div>
  )
}

function MiniProgressBar({ value, color, label, sublabel }: { value: number; color: string; label: string; sublabel?: string }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-[8px] text-muted-foreground/70">{label}</span>
        <span className="text-[9px] font-bold tabular-nums text-foreground">{value}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-[#1a2030] overflow-hidden ring-1 ring-inset ring-[#2a3855]/20">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ delay: 0.3, duration: 0.8, ease: CARD_EASE }}
        />
      </div>
      {sublabel && <p className="text-[7px] text-muted-foreground/40">{sublabel}</p>}
    </div>
  )
}

/* ── Card 1: THỜI GIAN VẬN HÀNH ── */
function OperatingTimeCard({ data, index }: { data: FleetSummary; index: number }) {
  const total = data.workingHours + data.idleHours + data.downtimeHours
  const workPct = Math.round((data.workingHours / total) * 100)
  const idlePct = Math.round((data.idleHours / total) * 100)
  const downPct = 100 - workPct - idlePct

  return (
    <KpiShell
      index={index}
      theme={THEMES.sky}
      icon={<Clock className="w-3 h-3" />}
      title="Thời gian vận hành"
      headerRight={<TrendBadge value={data.availabilityTrend} />}
    >
      {/* Hero */}
      <div className="flex items-baseline gap-1.5">
        <span className="text-[1.7rem] font-black tabular-nums leading-none bg-gradient-to-br from-sky-200 via-sky-300 to-sky-500 bg-clip-text text-transparent">
          {data.availabilityPct}
        </span>
        <span className="text-[11px] font-bold text-sky-400/70">%</span>
        <span className="text-[9px] text-muted-foreground/60 ml-1">Availability</span>
      </div>

      {/* Stacked bar */}
      <div className="space-y-1">
        <div className="flex h-3 rounded-lg overflow-hidden gap-px">
          <motion.div
            className="h-full bg-gradient-to-r from-green-600 to-emerald-400"
            initial={{ width: 0 }}
            animate={{ width: `${workPct}%` }}
            transition={{ delay: 0.2, duration: 0.9, ease: CARD_EASE }}
            title={`Hoạt động ${workPct}%`}
          />
          <motion.div
            className="h-full bg-gradient-to-r from-amber-600 to-amber-400"
            initial={{ width: 0 }}
            animate={{ width: `${idlePct}%` }}
            transition={{ delay: 0.35, duration: 0.9, ease: CARD_EASE }}
            title={`Chờ việc ${idlePct}%`}
          />
          <motion.div
            className="h-full bg-gradient-to-r from-red-700 to-red-400"
            initial={{ width: 0 }}
            animate={{ width: `${downPct}%` }}
            transition={{ delay: 0.5, duration: 0.9, ease: CARD_EASE }}
            title={`Dừng ${downPct}%`}
          />
        </div>

        <div className="grid grid-cols-3 gap-1">
          {[
            { label: 'Hoạt động', hours: data.workingHours, color: '#22c55e', pct: workPct },
            { label: 'Chờ việc',  hours: data.idleHours,    color: '#fbbf24', pct: idlePct },
            { label: 'Dừng máy',  hours: data.downtimeHours, color: '#f87171', pct: downPct },
          ].map(item => (
            <div
              key={item.label}
              className="flex flex-col items-center gap-0 px-1 py-1.5 rounded-lg border border-[#1e2433]/50"
              style={{ background: `${item.color}09` }}
            >
              <span className="w-1.5 h-1.5 rounded-full mb-0.5" style={{ background: item.color }} />
              <span className="text-[11px] font-black tabular-nums leading-none" style={{ color: item.color }}>
                {item.hours.toLocaleString('vi-VN')}
              </span>
              <span className="text-[6px] text-muted-foreground/50 text-center leading-tight">h · {item.pct}%</span>
              <span className="text-[6px] text-muted-foreground/40 text-center truncate w-full text-center">{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </KpiShell>
  )
}

/* ── Card 2: HIỆU QUẢ KHAI THÁC ── */
function UtilizationCard({ data, index }: { data: UtilizationKpi; index: number }) {
  return (
    <KpiShell
      index={index}
      theme={THEMES.emerald}
      icon={<Gauge className="w-3 h-3" />}
      title="Hiệu quả khai thác"
      headerRight={<TrendBadge value={data.fleetUtilizationTrend} />}
    >
      {/* Hero */}
      <div className="flex items-baseline gap-1.5">
        <span className="text-[1.7rem] font-black tabular-nums leading-none bg-gradient-to-br from-emerald-200 via-green-300 to-emerald-500 bg-clip-text text-transparent">
          {data.fleetUtilizationPct}
        </span>
        <span className="text-[11px] font-bold text-emerald-400/70">%</span>
        <span className="text-[9px] text-muted-foreground/60 ml-1">Fleet Utilization</span>
      </div>

      <div className="space-y-2">
        <MiniProgressBar value={data.mobilizationRatePct} color="#34d399" label="Tỷ lệ huy động" sublabel={`↑${data.mobilizationTrend}% so với tháng trước`} />
        <MiniProgressBar value={data.dispatchCompletionPct} color="#22d3ee" label="Dispatch Completion" />
        <MiniProgressBar value={data.onTimeDispatchPct} color="#60a5fa" label="On-time Dispatch" />
      </div>
    </KpiShell>
  )
}

/* ── Card 3: NĂNG SUẤT THI CÔNG ── */
function OutputCard({ data, index }: { data: OutputKpi; index: number }) {
  const metrics = [
    { label: 'Giờ',   value: `${data.outputPerHour}`,       unit: 'm/giờ',   trend: data.outputPerHourTrend },
    { label: 'Ca',    value: `${data.outputPerShift}`,      unit: 'm/ca',    trend: data.outputPerShiftTrend },
    { label: 'Ngày',  value: data.outputPerDay.toLocaleString('vi-VN'),   unit: 'm/ngày',  trend: data.outputPerDayTrend },
    { label: 'Tháng', value: data.outputPerMonth.toLocaleString('vi-VN'), unit: 'm/tháng', trend: data.outputPerMonthTrend },
  ]

  return (
    <KpiShell
      index={index}
      theme={THEMES.violet}
      icon={<Pickaxe className="w-3 h-3" />}
      title="Năng suất thi công"
      headerRight={<TrendBadge value={data.outputPerHourTrend} />}
    >
      <div className="grid grid-cols-2 gap-1.5">
        {metrics.map(m => (
          <div
            key={m.label}
            className="flex flex-col gap-0.5 px-2 py-2 rounded-xl border border-[#1e2433]/60 bg-[#060b14]/50"
          >
            <span className="text-[7px] font-bold text-muted-foreground/60 uppercase tracking-wider">{m.label}</span>
            <div className="flex items-baseline gap-1">
              <span className="text-[13px] font-black tabular-nums leading-none text-foreground">{m.value}</span>
              <span className="text-[7px] text-muted-foreground/50">{m.unit}</span>
            </div>
            <TrendBadge value={m.trend} />
          </div>
        ))}
      </div>
    </KpiShell>
  )
}

/* ── Card 4: HIỆU QUẢ NHIÊN LIỆU ── */
function FuelCard({ data, index }: { data: FuelKpi; index: number }) {
  const metrics = [
    { label: 'Tiêu thụ/giờ',       value: `${data.fuelPerHour}`, unit: 'lít/giờ', trend: data.fuelPerHourTrend, invert: true },
    { label: 'Chi phí/giờ',        value: (data.fuelCostPerHour / 1000).toFixed(0), unit: 'K VND/giờ', trend: data.fuelCostPerHourTrend, invert: false },
    { label: 'Fuel Variance',      value: `+${data.fuelVariancePct}`,  unit: '%', trend: data.fuelVarianceTrend, invert: false },
    { label: 'Tỷ lệ thất thoát',   value: `${data.fuelLossRatePct}`, unit: '%',  trend: data.fuelLossRateTrend, invert: true },
  ]

  return (
    <KpiShell
      index={index}
      theme={THEMES.amber}
      icon={<Fuel className="w-3 h-3" />}
      title="Hiệu quả nhiên liệu"
      headerRight={<TrendBadge value={data.fuelPerHourTrend} invert suffix="%" />}
    >
      <div className="grid grid-cols-2 gap-1.5">
        {metrics.map(m => (
          <div
            key={m.label}
            className="flex flex-col gap-0.5 px-2 py-2 rounded-xl border border-[#1e2433]/60 bg-[#060b14]/50"
          >
            <span className="text-[7px] font-bold text-muted-foreground/60 uppercase tracking-wider leading-tight">{m.label}</span>
            <div className="flex items-baseline gap-1">
              <span className="text-[13px] font-black tabular-nums leading-none text-foreground">{m.value}</span>
              <span className="text-[7px] text-muted-foreground/50">{m.unit}</span>
            </div>
            <TrendBadge value={m.trend} invert={m.invert} />
          </div>
        ))}
      </div>
    </KpiShell>
  )
}

/* ── Main export ── */
export function ProductivityKpiTier({
  fleet, utilization, output, fuel,
}: {
  fleet: FleetSummary
  utilization: UtilizationKpi
  output: OutputKpi
  fuel: FuelKpi
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5 items-stretch">
      <OperatingTimeCard data={fleet} index={0} />
      <UtilizationCard data={utilization} index={1} />
      <OutputCard data={output} index={2} />
      <FuelCard data={fuel} index={3} />
    </div>
  )
}
