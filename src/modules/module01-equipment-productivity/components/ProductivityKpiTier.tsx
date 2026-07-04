import { type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, Clock, Fuel, Gauge, Pickaxe } from 'lucide-react'
import { cn } from '@/utils/cn'
import type { AiInsight, ProductivityMachine } from '../types'

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

function pct(part: number, total: number): number {
  if (total <= 0) return 0
  return Math.round((part / total) * 100)
}

function avg(values: number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function formatDecimal(value: number, digits = 1): string {
  return value.toLocaleString('vi-VN', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
}

function formatCompactVnd(value: number): string {
  if (value >= 1_000_000) return `${formatDecimal(value / 1_000_000, 1)}M`
  return `${Math.round(value / 1_000).toLocaleString('vi-VN')}K`
}

function getProductivityStats(machines: ProductivityMachine[]) {
  const totalMachines = machines.length
  const workingMachines = machines.filter(machine => machine.status === 'Working').length
  const idleMachines = machines.filter(machine => machine.status === 'Standby').length
  const downtimeMachines = machines.filter(machine => machine.status === 'Breakdown').length
  const workingHours = machines.reduce((sum, machine) => sum + machine.workingHours, 0)
  const idleHours = machines.reduce((sum, machine) => sum + machine.idleHours, 0)
  const downtimeHours = machines.reduce((sum, machine) => sum + machine.downtimeHours, 0)
  const hourTotal = workingHours + idleHours + downtimeHours
  const dispatchDone = machines.filter(machine => machine.dispatchStatus !== 'Pending').length
  const dispatchOnTime = machines.filter(machine => machine.dispatchStatus === 'On-time').length

  return {
    totalMachines,
    workingMachines,
    idleMachines,
    downtimeMachines,
    workingPct: pct(workingMachines, totalMachines),
    idlePct: pct(idleMachines, totalMachines),
    downtimePct: pct(downtimeMachines, totalMachines),
    workingHours,
    idleHours,
    downtimeHours,
    workingHourPct: pct(workingHours, hourTotal),
    idleHourPct: pct(idleHours, hourTotal),
    downtimeHourPct: pct(downtimeHours, hourTotal),
    fleetUtilizationPct: Math.round(avg(machines.map(machine => machine.utilizationPct)) * 10) / 10,
    mobilizationRatePct: pct(workingMachines + idleMachines, totalMachines),
    dispatchCompletionPct: pct(dispatchDone, totalMachines),
    onTimeDispatchPct: pct(dispatchOnTime, totalMachines),
    outputPerHour: Math.round(avg(machines.map(machine => machine.outputPerHour)) * 10) / 10,
    outputPerShift: Math.round(avg(machines.map(machine => machine.outputPerHour)) * 7.5),
    outputPerDay: Math.round(machines.reduce((sum, machine) => sum + machine.outputPerHour * 8, 0)),
    outputPerMonth: Math.round(machines.reduce((sum, machine) => sum + machine.outputPerHour * 8 * 26, 0)),
    fuelPerHour: Math.round(avg(machines.map(machine => machine.fuelLitresPerHour)) * 10) / 10,
    fuelCostPerHour: Math.round(avg(machines.map(machine => machine.fuelCostVndPerHour))),
    highFuelMachines: machines.filter(machine => machine.fuelLitresPerHour > avg(machines.map(m => m.fuelLitresPerHour)) * 1.15).length,
    idleMachinesList: machines
      .filter(machine => machine.status === 'Standby')
      .sort((a, b) => b.idleHours - a.idleHours),
  }
}

type ProductivityStats = ReturnType<typeof getProductivityStats>

/* ── Card 1: ĐỘI MÁY & TRẠNG THÁI ── */
function FleetStatusCard({ stats, index }: { stats: ProductivityStats; index: number }) {
  const maxIdle = stats.idleMachinesList[0]

  return (
    <KpiShell
      index={index}
      theme={THEMES.sky}
      icon={<Clock className="w-3 h-3" />}
      title="Đội máy & trạng thái"
      headerRight={(
        <span className="text-[8px] font-bold text-sky-300 tabular-nums">
          {stats.totalMachines} máy
        </span>
      )}
    >
      {/* Hero */}
      <div className="flex items-baseline gap-1.5">
        <span className="text-[1.7rem] font-black tabular-nums leading-none bg-gradient-to-br from-sky-200 via-sky-300 to-sky-500 bg-clip-text text-transparent">
          {stats.workingMachines}
        </span>
        <span className="text-[9px] text-muted-foreground/60 ml-1">đang chạy</span>
        <span className="ml-auto text-[9px] font-bold text-amber-400 tabular-nums">
          {stats.idleMachines} idle
        </span>
      </div>

      {/* Stacked bar */}
      <div className="space-y-1">
        <div className="flex h-3 rounded-lg overflow-hidden gap-px">
          <motion.div
            className="h-full bg-gradient-to-r from-green-600 to-emerald-400"
            initial={{ width: 0 }}
            animate={{ width: `${stats.workingPct}%` }}
            transition={{ delay: 0.2, duration: 0.9, ease: CARD_EASE }}
            title={`Đang chạy ${stats.workingPct}%`}
          />
          <motion.div
            className="h-full bg-gradient-to-r from-amber-600 to-amber-400"
            initial={{ width: 0 }}
            animate={{ width: `${stats.idlePct}%` }}
            transition={{ delay: 0.35, duration: 0.9, ease: CARD_EASE }}
            title={`Idle ${stats.idlePct}%`}
          />
          <motion.div
            className="h-full bg-gradient-to-r from-red-700 to-red-400"
            initial={{ width: 0 }}
            animate={{ width: `${stats.downtimePct}%` }}
            transition={{ delay: 0.5, duration: 0.9, ease: CARD_EASE }}
            title={`Dừng máy ${stats.downtimePct}%`}
          />
        </div>

        <div className="grid grid-cols-3 gap-1">
          {[
            { label: 'Chạy', value: stats.workingMachines, color: '#22c55e', pct: stats.workingPct },
            { label: 'Idle', value: stats.idleMachines, color: '#fbbf24', pct: stats.idlePct },
            { label: 'Dừng', value: stats.downtimeMachines, color: '#f87171', pct: stats.downtimePct },
          ].map(item => (
            <div
              key={item.label}
              className="flex flex-col items-center gap-0 px-1 py-1.5 rounded-lg border border-[#1e2433]/50"
              style={{ background: `${item.color}09` }}
            >
              <span className="w-1.5 h-1.5 rounded-full mb-0.5" style={{ background: item.color }} />
              <span className="text-[11px] font-black tabular-nums leading-none" style={{ color: item.color }}>
                {item.value.toLocaleString('vi-VN')}
              </span>
              <span className="text-[6px] text-muted-foreground/50 text-center leading-tight">{item.pct}% đội máy</span>
              <span className="text-[6px] text-muted-foreground/40 text-center truncate w-full">{item.label}</span>
            </div>
          ))}
        </div>
        {maxIdle && (
          <p className="text-[8px] text-muted-foreground/60 truncate">
            Idle lâu nhất: <span className="text-amber-400 font-semibold">{maxIdle.machineCode}</span> · {maxIdle.idleHours}h
          </p>
        )}
      </div>
    </KpiShell>
  )
}

/* ── Card 2: HIỆU QUẢ KHAI THÁC ── */
function UtilizationCard({ stats, index }: { stats: ProductivityStats; index: number }) {
  return (
    <KpiShell
      index={index}
      theme={THEMES.emerald}
      icon={<Gauge className="w-3 h-3" />}
      title="Hiệu quả khai thác"
      headerRight={<span className="text-[8px] font-bold text-emerald-300">từ bảng máy</span>}
    >
      {/* Hero */}
      <div className="flex items-baseline gap-1.5">
        <span className="text-[1.7rem] font-black tabular-nums leading-none bg-gradient-to-br from-emerald-200 via-green-300 to-emerald-500 bg-clip-text text-transparent">
          {stats.fleetUtilizationPct}
        </span>
        <span className="text-[11px] font-bold text-emerald-400/70">%</span>
        <span className="text-[9px] text-muted-foreground/60 ml-1">Fleet Utilization</span>
      </div>

      <div className="space-y-2">
        <MiniProgressBar value={stats.idlePct} color="#fbbf24" label="Idle rate" sublabel={`${stats.idleMachines} máy đang chờ việc`} />
        <MiniProgressBar value={stats.mobilizationRatePct} color="#34d399" label="Tỷ lệ huy động" />
        <MiniProgressBar value={stats.onTimeDispatchPct} color="#60a5fa" label="On-time Dispatch" />
      </div>
    </KpiShell>
  )
}

/* ── Card 3: NĂNG SUẤT THI CÔNG ── */
function OutputCard({ stats, index }: { stats: ProductivityStats; index: number }) {
  const metrics = [
    { label: 'Giờ', value: formatDecimal(stats.outputPerHour), unit: 'm/giờ' },
    { label: 'Ca', value: stats.outputPerShift.toLocaleString('vi-VN'), unit: 'm/ca' },
    { label: 'Ngày', value: stats.outputPerDay.toLocaleString('vi-VN'), unit: 'm/ngày' },
    { label: 'Tháng', value: stats.outputPerMonth.toLocaleString('vi-VN'), unit: 'm/tháng' },
  ]

  return (
    <KpiShell
      index={index}
      theme={THEMES.violet}
      icon={<Pickaxe className="w-3 h-3" />}
      title="Năng suất thi công"
      headerRight={<span className="text-[8px] font-bold text-violet-300">avg fleet</span>}
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
          </div>
        ))}
      </div>
    </KpiShell>
  )
}

/* ── Card 4: HIỆU QUẢ NHIÊN LIỆU ── */
function FuelAndAiCard({ stats, insight, index }: { stats: ProductivityStats; insight?: AiInsight; index: number }) {
  const metrics = [
    { label: 'Lít/giờ', value: formatDecimal(stats.fuelPerHour), unit: 'lít/h' },
    { label: 'Chi phí/giờ', value: formatCompactVnd(stats.fuelCostPerHour), unit: 'VND/h' },
    { label: 'Máy vượt chuẩn', value: stats.highFuelMachines.toString(), unit: 'máy' },
  ]

  return (
    <KpiShell
      index={index}
      theme={THEMES.amber}
      icon={<Fuel className="w-3 h-3" />}
      title="Nhiên liệu & AI"
      headerRight={insight && (
        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-400 text-[7px] font-bold">
          <AlertTriangle className="w-2.5 h-2.5" />
          {insight.severity}
        </span>
      )}
    >
      <div className="grid grid-cols-3 gap-1.5">
        {metrics.map(m => (
          <div
            key={m.label}
            className="flex flex-col gap-0.5 px-1.5 py-2 rounded-xl border border-[#1e2433]/60 bg-[#060b14]/50 min-w-0"
          >
            <span className="text-[7px] font-bold text-muted-foreground/60 uppercase tracking-wider leading-tight">{m.label}</span>
            <div className="flex items-baseline gap-1">
              <span className="text-[13px] font-black tabular-nums leading-none text-foreground">{m.value}</span>
              <span className="text-[7px] text-muted-foreground/50">{m.unit}</span>
            </div>
          </div>
        ))}
      </div>
      {insight && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-2 py-1.5">
          <p className="text-[8px] font-semibold text-amber-300 truncate">{insight.machineOrProject}: {insight.title}</p>
          <p className="text-[7px] text-muted-foreground/70 truncate">{insight.shortDesc}</p>
        </div>
      )}
    </KpiShell>
  )
}

/* ── Main export ── */
export function ProductivityKpiTier({
  machines, topInsight,
}: {
  machines: ProductivityMachine[]
  topInsight?: AiInsight
}) {
  const stats = getProductivityStats(machines)

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[1.25fr_1fr_1fr_0.95fr] gap-2.5 items-stretch">
      <FleetStatusCard stats={stats} index={0} />
      <UtilizationCard stats={stats} index={1} />
      <OutputCard stats={stats} index={2} />
      <FuelAndAiCard stats={stats} insight={topInsight} index={3} />
    </div>
  )
}
